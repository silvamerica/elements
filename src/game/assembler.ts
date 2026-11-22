import Matter from "matter-js";
import { addCounts, type Counts } from "../chemistry/elements";
import { type Recipe, recipeById } from "../chemistry/recipes";
import type { Point } from "../world/events";
import type { Entity, World } from "../world/world";

/** Pieces fly at up to this speed (px per physics step). */
const SPEED = 14;
/** Close enough to the target to count as arrived. */
const ARRIVE = 26;
/** Give up waiting and snap anyway after this long. */
const TIMEOUT_MS = 3000;
/** Tapping within this distance of a same-kind molecule joins it. */
const JOIN_REACH = 90;

export type Plan =
	| { ok: true; recipe: Recipe; pieces: Entity[]; at: Point; join?: Entity }
	| { ok: false; recipe: Recipe; short: Counts };

interface Flight {
	recipe: Recipe;
	pieces: Entity[];
	at: Point;
	join: Entity | undefined;
	age: number;
}

/**
 * Builds a known molecule on request: gathers the nearest pieces that add
 * up to it (unfinished clusters first, then free atoms; never anyone's
 * finished molecules), flies them to the spot as ghosts and snaps them.
 * Placed on or beside the same molecule or its structure, the new one
 * joins it, which is how tapping climbs the structure tiers.
 */
export class Assembler {
	private readonly flights: Flight[] = [];
	private readonly reserved = new Set<number>();

	constructor(
		private readonly world: World,
		/** Is this entity in the player's hand right now? */
		private readonly held: (e: Entity) => boolean = () => false,
	) {}

	/**
	 * Work out what building `recipeId` at `at` would take. `tapped` is what
	 * the tap landed on, if anything: a fitting partial becomes the first
	 * piece; a same-kind molecule or structure becomes what it joins.
	 */
	plan(recipeId: string, at: Point, tapped?: Entity): Plan {
		const recipe = recipeById(recipeId);
		let need: Counts = { ...recipe.formula };
		const pieces: Entity[] = [];
		let join: Entity | undefined;
		let target = at;

		const take = (e: Entity) => {
			pieces.push(e);
			need = subtract(need, this.world.countsOf(e));
		};

		if (tapped && tapped.kind !== "atoms" && tapped.recipe.id === recipe.id)
			join = tapped;
		else if (
			tapped?.kind === "atoms" &&
			this.usable(tapped) &&
			fits(this.world.countsOf(tapped), need)
		) {
			take(tapped);
			target = this.world.centroidOf(tapped);
		}
		if (!join) join = this.sameKindNear(recipe.id, target);

		const free = [...this.world.all()].filter(
			(e): e is Extract<Entity, { kind: "atoms" }> =>
				e.kind === "atoms" && this.usable(e) && !pieces.includes(e),
		);
		const byDistance = (a: Entity, b: Entity) =>
			dist(this.world.centroidOf(a), target) -
			dist(this.world.centroidOf(b), target);
		// Bigger chunks first, then nearer.
		const clusters = free
			.filter((e) => e.bodies.length > 1)
			.sort((a, b) => b.bodies.length - a.bodies.length || byDistance(a, b));
		for (const c of clusters) if (fits(this.world.countsOf(c), need)) take(c);
		const singles = free.filter((e) => e.bodies.length === 1).sort(byDistance);
		for (const s of singles) {
			if (total(need) === 0) break;
			if (fits(this.world.countsOf(s), need)) take(s);
		}

		if (total(need) > 0) return { ok: false, recipe, short: need };
		const spot = join ? beside(this.world.centroidOf(join), target) : target;
		return { ok: true, recipe, pieces, at: spot, join };
	}

	/** Plan and, if possible, send the pieces flying. */
	place(recipeId: string, at: Point, tapped?: Entity): Plan {
		const plan = this.plan(recipeId, at, tapped);
		if (!plan.ok) return plan;
		for (const p of plan.pieces) {
			this.reserved.add(p.id);
			this.world.setGhost(p, true);
			this.world.touch(p);
		}
		this.flights.push({
			recipe: plan.recipe,
			pieces: plan.pieces,
			at: plan.at,
			join: plan.join,
			age: 0,
		});
		return plan;
	}

	/** Steer pieces home; snap the ones that have all arrived. Call once per frame. */
	update(dtMs: number): void {
		for (let i = this.flights.length - 1; i >= 0; i--) {
			const f = this.flights[i] as Flight;
			f.age += dtMs;
			const gone = f.pieces.some((p) => !this.world.get(p.id) || this.held(p));
			if (gone) {
				this.end(f, i);
				continue;
			}
			let arrived = true;
			for (const p of f.pieces) {
				for (const b of this.world.bodiesOf(p)) {
					const dx = f.at.x - b.position.x;
					const dy = f.at.y - b.position.y;
					const d = Math.hypot(dx, dy);
					if (d > ARRIVE) arrived = false;
					const v = Math.min(SPEED, d * 0.15);
					Matter.Body.setVelocity(
						b,
						d > 0.5 ? { x: (dx / d) * v, y: (dy / d) * v } : { x: 0, y: 0 },
					);
				}
			}
			if (arrived || f.age > TIMEOUT_MS) {
				this.end(f, i, true);
			}
		}
	}

	/** Whether tapping `e` while `recipeId` is armed should build onto it. */
	relates(recipeId: string, e: Entity): boolean {
		if (e.kind !== "atoms") return e.recipe.id === recipeId;
		return fits(this.world.countsOf(e), recipeById(recipeId).formula);
	}

	/** Pieces in flight, for the renderer or tests. */
	inFlight(): number {
		return this.flights.length;
	}

	private end(f: Flight, i: number, snap = false): void {
		this.flights.splice(i, 1);
		for (const p of f.pieces) this.reserved.delete(p.id);
		if (!snap) {
			for (const p of f.pieces)
				if (this.world.get(p.id)) this.world.setGhost(p, false);
			return;
		}
		const m = this.world.assemble(f.recipe.id, f.pieces, f.at);
		const join = f.join && this.world.get(f.join.id);
		if (join) this.world.tryBond(m, join);
	}

	private usable(e: Entity): boolean {
		return !this.reserved.has(e.id) && !this.world.isGhost(e) && !this.held(e);
	}

	private sameKindNear(recipeId: string, at: Point): Entity | undefined {
		let best: Entity | undefined;
		let bestD = JOIN_REACH;
		for (const e of this.world.all()) {
			if (
				e.kind === "atoms" ||
				e.recipe.id !== recipeId ||
				this.world.isGhost(e)
			)
				continue;
			for (const p of this.world.circlesOf(e)) {
				const d = dist(p.position, at);
				if (d < bestD) {
					bestD = d;
					best = e;
				}
			}
		}
		return best;
	}
}

function subtract(a: Counts, b: Counts): Counts {
	const out = addCounts(a, {});
	for (const [el, n] of Object.entries(b)) out[el] = (out[el] ?? 0) - (n ?? 0);
	return out;
}

function fits(have: Counts, need: Counts): boolean {
	for (const [el, n] of Object.entries(have))
		if ((n ?? 0) > (need[el] ?? 0)) return false;
	return true;
}

function total(c: Counts): number {
	let n = 0;
	for (const v of Object.values(c)) if ((v ?? 0) > 0) n += v ?? 0;
	return n;
}

function dist(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A spot just off `anchor`, on the side the tap came from. */
function beside(anchor: Point, tap: Point): Point {
	const dx = tap.x - anchor.x;
	const dy = tap.y - anchor.y;
	const d = Math.hypot(dx, dy) || 1;
	return { x: anchor.x + (dx / d) * 45, y: anchor.y + (dy / d) * 45 };
}
