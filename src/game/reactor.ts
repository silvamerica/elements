import Matter from "matter-js";
import {
	REACTIONS,
	type Reaction,
	type Species,
	speciesLabel,
} from "../chemistry/reactions";
import { findRecipe } from "../chemistry/recipes";
import type { Point } from "../world/events";
import { atomTag, type Entity, type World } from "../world/world";

/** Other reactants (and catalysts) must be this close to where the drop lands. */
export const REACT_RADIUS = 120;
/** A hot reaction warms this far around it... */
export const HEAT_RADIUS = 170;
/** ...for this long. */
export const HEAT_MS = 1500;
/** Letting go with the pointer moving at least this fast (screen px per ms) is a spark. */
export const SPARK_SPEED = 1.1;
/** Bangs shove everything within this radius. */
const BANG_RADIUS = 240;

export interface HeatZone {
	at: Point;
	until: number;
}

export type DropResult =
	/** A reaction went. */
	| { kind: "reacted"; reaction: Reaction }
	/** Everything is here but it needs a spark: the pieces bounce apart. */
	| { kind: "needs-heat"; reaction: Reaction }
	/** Some reaction could go here, but pieces are missing. */
	| { kind: "incomplete"; reaction: Reaction; missing: Record<Species, number> }
	/** No reaction involves these two. */
	| { kind: "none" };

/** What an entity is as a reaction species, if anything: a lone atom or a free molecule. */
export function speciesOf(e: Entity): Species | undefined {
	if (e.kind === "molecule") return e.recipe.id;
	if (e.kind === "atoms" && e.bodies.length === 1 && e.bodies[0])
		return atomTag(e.bodies[0]).element;
	return undefined;
}

/**
 * Runs real chemistry between molecules: on a drop, when everything a
 * reaction needs is close by (and hot enough), the reactants become the
 * products. Hot reactions leave heat behind that ignites any complete set
 * of reactants inside it that needs heat, so fires can chain across the board.
 */
export class Reactor {
	private zones: HeatZone[] = [];
	private time = 0;

	constructor(
		private readonly world: World,
		private readonly held: (e: Entity) => boolean = () => false,
	) {}

	/** Reactions this species takes part in (as a reactant or catalyst). */
	static involving(s: Species): Reaction[] {
		return REACTIONS.filter((r) => s in r.reactants || r.catalyst === s);
	}

	/** Drop `dropped` onto `target`, `sparked` if it was flung. */
	drop(dropped: Entity, target: Entity, sparked: boolean): DropResult {
		const a = speciesOf(dropped);
		const b = speciesOf(target);
		if (!a || !b) return { kind: "none" };
		const options = REACTIONS.filter(
			(r) =>
				involves(r, a) &&
				involves(r, b) &&
				(a !== b || (r.reactants[a] ?? 0) >= 2),
		);
		if (options.length === 0) return { kind: "none" };

		const at = this.world.centroidOf(target);
		const warm = this.isHot(at);
		let best: DropResult | undefined;
		let bestMissing = Number.POSITIVE_INFINITY;
		for (const r of options) {
			const found = this.gather(r, at, [dropped, target]);
			if (found.complete) {
				if (r.needsHeat && !(sparked || (warm && !r.sparkOnly))) {
					if (!best || best.kind === "incomplete")
						best = { kind: "needs-heat", reaction: r };
					continue;
				}
				this.run(r, found.consumed, at);
				return { kind: "reacted", reaction: r };
			}
			const n = Object.values(found.missing).reduce((x, y) => x + y, 0);
			if (n < bestMissing && best?.kind !== "needs-heat") {
				bestMissing = n;
				best = { kind: "incomplete", reaction: r, missing: found.missing };
			}
		}
		return best ?? { kind: "none" };
	}

	/** Heat zones fade; inside them, any complete set of reactants for a reaction that needs heat goes up. Call once per frame. */
	update(dtMs: number): void {
		this.time += dtMs;
		this.zones = this.zones.filter((z) => z.until > this.time);
		for (const z of [...this.zones]) {
			// One reaction per zone per frame, so chains ripple rather than all firing at once.
			const near = [...this.world.all()].filter(
				(e) =>
					speciesOf(e) &&
					!this.held(e) &&
					!this.world.isGhost(e) &&
					dist(this.world.centroidOf(e), z.at) < HEAT_RADIUS,
			);
			outer: for (const e of near) {
				const s = speciesOf(e) as Species;
				// Heat only ignites: reactions that go cold happen when you drop things.
				for (const r of REACTIONS) {
					if (!r.needsHeat || r.sparkOnly || !(s in r.reactants)) continue;
					const at = this.world.centroidOf(e);
					const found = this.gather(r, at, [e]);
					if (found.complete) {
						this.run(r, found.consumed, at);
						break outer;
					}
				}
			}
		}
	}

	heatZones(): readonly HeatZone[] {
		return this.zones;
	}

	/** Heat zones with how much heat is left in each (1 fresh, 0 gone). */
	heatGlow(): { at: Point; left: number }[] {
		return this.zones.map((z) => ({
			at: z.at,
			left: Math.max(0, (z.until - this.time) / HEAT_MS),
		}));
	}

	isHot(at: Point): boolean {
		return this.zones.some((z) => dist(z.at, at) < HEAT_RADIUS);
	}

	/**
	 * Find everything reaction `r` needs around `at`, starting from `start`
	 * (which must be part of it). Catalysts must be present but aren't consumed.
	 */
	private gather(r: Reaction, at: Point, start: Entity[]) {
		const need: Record<Species, number> = { ...r.reactants };
		const consumed: Entity[] = [];
		const taken = new Set<number>();
		let catalystFound = !r.catalyst;
		for (const e of start) {
			const s = speciesOf(e);
			if (!s) continue;
			if ((need[s] ?? 0) > 0) {
				need[s] = (need[s] ?? 0) - 1;
				consumed.push(e);
				taken.add(e.id);
			} else if (s === r.catalyst) {
				catalystFound = true;
				taken.add(e.id);
			}
		}
		const nearby = [...this.world.all()]
			.filter(
				(e) =>
					!taken.has(e.id) &&
					speciesOf(e) &&
					!this.held(e) &&
					!this.world.isGhost(e),
			)
			.map((e) => ({ e, d: dist(this.world.centroidOf(e), at) }))
			.filter((x) => x.d < REACT_RADIUS)
			.sort((x, y) => x.d - y.d);
		for (const { e } of nearby) {
			const s = speciesOf(e) as Species;
			if ((need[s] ?? 0) > 0) {
				need[s] = (need[s] ?? 0) - 1;
				consumed.push(e);
			} else if (s === r.catalyst) catalystFound = true;
		}
		const missing: Record<Species, number> = {};
		for (const [s, n] of Object.entries(need)) if (n > 0) missing[s] = n;
		if (!catalystFound && r.catalyst) missing[r.catalyst] = 1;
		return { complete: Object.keys(missing).length === 0, consumed, missing };
	}

	private run(r: Reaction, consumed: Entity[], at: Point): void {
		this.world.consume(consumed);
		let i = 0;
		const n = Object.values(r.products).reduce((x, y) => x + y, 0);
		for (const [s, count] of Object.entries(r.products))
			for (let k = 0; k < count; k++, i++) {
				const a = (i / n) * Math.PI * 2 + 0.4;
				const spot = { x: at.x + Math.cos(a) * 28, y: at.y + Math.sin(a) * 28 };
				const e = findRecipe(s)
					? this.world.spawnMolecule(s, spot)
					: this.world.spawnAtom(s, spot);
				for (const b of this.world.bodiesOf(e))
					Matter.Body.setVelocity(b, {
						x: Math.cos(a) * 3,
						y: Math.sin(a) * 3,
					});
			}
		if (r.effect === "bang") this.shove(at);
		if (r.hot) this.zones.push({ at, until: this.time + HEAT_MS });
		this.world.events.emit("reacted", { reaction: r, at });
	}

	private shove(at: Point): void {
		for (const e of this.world.all()) {
			if (this.held(e)) continue;
			for (const b of this.world.bodiesOf(e)) {
				const dx = b.position.x - at.x;
				const dy = b.position.y - at.y;
				const d = Math.hypot(dx, dy);
				if (d < 1 || d > BANG_RADIUS) continue;
				const push = 9 * (1 - d / BANG_RADIUS);
				Matter.Body.setVelocity(b, {
					x: b.velocity.x + (dx / d) * push,
					y: b.velocity.y + (dy / d) * push,
				});
			}
		}
	}
}

function involves(r: Reaction, s: Species): boolean {
	return s in r.reactants || r.catalyst === s;
}

function dist(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** "one more O₂ and a C" style list. */
export function describeMissing(missing: Record<Species, number>): string {
	return Object.entries(missing)
		.map(([s, n]) => `${n} ${speciesLabel(s)}`)
		.join(" and ");
}
