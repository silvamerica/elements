import type Matter from "matter-js";
import type { Counts } from "../chemistry/elements";
import type { Point } from "../world/events";
import type { Entity, World } from "../world/world";

/** How long the "go get these" pulse stays on atoms after picking a tray entry. */
export const GUIDE_MS = 4000;

/**
 * What the player has their hands on: the tapped or dragged entity, kept
 * across bonds (when it's consumed into something bigger, the result
 * becomes the selection), plus the atoms a tray entry pointed them to.
 */
export class Selection {
	private id: number | undefined;
	private guide: { atoms: Matter.Body[]; until: number } | undefined;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly world: World) {
		const follow = ({ entityId }: { entityId: number }) => {
			if (this.id !== undefined && !world.get(this.id)) this.set(entityId);
		};
		world.events.on("snapped", follow);
		world.events.on("bonded", follow);
		world.events.on("joined", follow);
	}

	/** The selected entity, if it still exists. */
	current(): Entity | undefined {
		if (this.id === undefined) return undefined;
		const e = this.world.get(this.id);
		if (!e) {
			this.id = undefined;
			this.guide = undefined;
			this.changed();
		}
		return e;
	}

	select(e: Entity | undefined): void {
		this.set(e?.id);
	}

	clear(): void {
		this.set(undefined);
	}

	onChange(fn: () => void): void {
		this.listeners.add(fn);
	}

	/**
	 * Point at the nearest free atoms that would supply `missing`, measured
	 * from the selection. Returns what couldn't be found on the board.
	 */
	guideTo(missing: Counts, now: number): Counts {
		const from = this.centre();
		const short: Counts = {};
		const atoms: Matter.Body[] = [];
		const free = this.world.freeAtoms();
		for (const [el, n] of Object.entries(missing)) {
			const near = free
				.filter((f) => f.element === el)
				.sort((a, b) => dist(a.at, from) - dist(b.at, from))
				.slice(0, n ?? 0);
			for (const f of near)
				if (f.entity.bodies[0]) atoms.push(f.entity.bodies[0]);
			if (near.length < (n ?? 0)) short[el] = (n ?? 0) - near.length;
		}
		this.guide = { atoms, until: now + GUIDE_MS };
		return short;
	}

	/** Atoms currently being pointed at (empty once the pulse has run out). */
	guided(now: number): Matter.Body[] {
		if (!this.guide || now > this.guide.until) return [];
		return this.guide.atoms;
	}

	private centre(): Point {
		const e = this.current();
		return e
			? this.world.centroidOf(e)
			: { x: this.world.width / 2, y: this.world.height / 2 };
	}

	private set(id: number | undefined): void {
		if (id === this.id) return;
		this.id = id;
		this.guide = undefined;
		this.changed();
	}

	private changed(): void {
		for (const fn of this.listeners) fn();
	}
}

function dist(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}
