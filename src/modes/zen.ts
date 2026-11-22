import { type Element, elementInfo } from "../chemistry/elements";
import { pickElement, type SpawnTable } from "../chemistry/worlds";
import type { Point } from "../world/events";
import type { World } from "../world/world";
import type { Mode } from "./mode";

/** A leftover must have been on the board this long before it can fade. */
export const MIN_FADE_AGE = 30_000;

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ZenOptions {
	/** The world's mix: what the free pool is kept in proportion to. */
	table: SpawnTable;
	random: () => number;
	/** Milliseconds between spawns when the pool is nearly full. */
	interval?: number;
	/** Milliseconds between spawns when the pool is half empty or less. */
	fastInterval?: number;
	/** Free single atoms on the board; at the cap, leftovers fade to make room. */
	cap?: number;
	/** Atoms placed when a brand-new world starts. */
	seed?: number;
	/** Share of spawns placed inside the visible area. */
	inView?: number;
}

/**
 * No score, no failure. Atoms keep arriving to keep the free pool in the
 * world's proportions: each spawn tops up whatever is most short of its
 * share, so whatever you use gets replaced. When the board is full, the
 * oldest atom of whatever is most over-supplied fades away to make room.
 */
export class ZenMode implements Mode {
	readonly name = "Zen";
	/** The part of the world on screen, if anyone is looking. */
	view: (() => Rect | undefined) | undefined;
	private world: World | undefined;
	private sinceSpawn = 0;
	private readonly table: SpawnTable;
	private readonly random: () => number;
	private readonly interval: number;
	private readonly fastInterval: number;
	private readonly cap: number;
	private readonly seedCount: number;
	private readonly inView: number;

	constructor(opts: ZenOptions) {
		this.table = opts.table;
		this.random = opts.random;
		this.interval = opts.interval ?? 2500;
		this.fastInterval = opts.fastInterval ?? this.interval;
		this.cap = opts.cap ?? 60;
		this.seedCount = opts.seed ?? 16;
		this.inView = opts.inView ?? 0.7;
	}

	/** `fresh` is false when the board came from a save and already has atoms. */
	start(world: World, fresh = true): void {
		this.world = world;
		if (fresh)
			for (let i = 0; i < this.seedCount; i++) world.spawnAtom(this.pick());
	}

	update(dtMs: number): void {
		const world = this.world;
		if (!world) return;
		this.sinceSpawn += dtMs;
		const free = world.freeAtoms();
		if (this.sinceSpawn < this.currentInterval(free.length)) return;
		this.sinceSpawn = 0;
		const have = countBy(free);
		if (free.length >= this.cap) {
			// A full board only swaps when something is genuinely short, and
			// only by retiring a leftover that has sat around a while.
			if (this.biggestShortfall(have) < 1) return;
			if (!this.fadeSurplus(world, free, have)) return;
		}
		const el = this.pickToRefill(have);
		world.spawnAtom(el, this.place(world, el));
	}

	stop(): void {
		this.world = undefined;
	}

	/** A plain draw from the world's mix. */
	pick(): Element {
		return pickElement(this.table, this.random());
	}

	/**
	 * A draw weighted by shortfall: how far each element's free count is
	 * below its share of a full pool. Anything absent is always a little
	 * short, so rare elements still turn up.
	 */
	pickToRefill(have: Record<Element, number>): Element {
		const weights: number[] = [];
		let total = 0;
		for (let i = 0; i < this.table.elements.length; i++) {
			const el = this.table.elements[i] as Element;
			const share = this.share(i);
			const w = Math.max(0, share * this.cap - (have[el] ?? 0));
			weights.push(w);
			total += w;
		}
		if (total <= 0) return this.pick();
		let roll = this.random() * total;
		for (let i = 0; i < weights.length; i++) {
			roll -= weights[i] ?? 0;
			if (roll < 0) return this.table.elements[i] as Element;
		}
		return this.table.elements.at(-1) ?? "H";
	}

	/** Spawn interval: fast while the pool is half empty, easing to slow as it fills. */
	currentInterval(free: number): number {
		const fill = free / this.cap;
		if (fill <= 0.5) return this.fastInterval;
		const t = Math.min(1, (fill - 0.5) / 0.5);
		return this.fastInterval + (this.interval - this.fastInterval) * t;
	}

	/** Where a new atom goes: usually somewhere on screen, otherwise anywhere. */
	place(world: World, el: Element): Point | undefined {
		const view = this.view?.();
		if (!view || this.random() >= this.inView) return undefined;
		const r = elementInfo(el).radius;
		const x0 = Math.max(r, view.x);
		const y0 = Math.max(r, view.y);
		const x1 = Math.min(world.width - r, view.x + view.width);
		const y1 = Math.min(world.height - r, view.y + view.height);
		if (x1 <= x0 || y1 <= y0) return undefined;
		return {
			x: x0 + this.random() * (x1 - x0),
			y: y0 + this.random() * (y1 - y0),
		};
	}

	/** Make room: the oldest atom of the most over-supplied element, off screen if possible. */
	/** How many of the most-needed element the pool is short of its share. */
	private biggestShortfall(have: Record<Element, number>): number {
		let most = 0;
		for (let i = 0; i < this.table.elements.length; i++) {
			const el = this.table.elements[i] as Element;
			most = Math.max(most, this.share(i) * this.cap - (have[el] ?? 0));
		}
		return most;
	}

	/**
	 * Make room: the oldest atom of the most over-supplied element, off screen
	 * if possible. Every element may keep at least one atom (so a rare stray
	 * isn't instantly over its tiny share), and nothing younger than
	 * MIN_FADE_AGE goes. Returns whether anything was faded.
	 */
	private fadeSurplus(
		world: World,
		free: ReturnType<World["freeAtoms"]>,
		have: Record<Element, number>,
	): boolean {
		let worst: Element | undefined;
		let worstSurplus = 0;
		for (const [el, n] of Object.entries(have)) {
			const i = this.table.elements.indexOf(el);
			const allowance = Math.max(1, i < 0 ? 0 : this.share(i) * this.cap);
			const surplus = n - allowance;
			const oldEnough = free.some(
				(f) => f.element === el && world.time - f.bornAt >= MIN_FADE_AGE,
			);
			if (surplus >= 1 && surplus > worstSurplus && oldEnough) {
				worstSurplus = surplus;
				worst = el;
			}
		}
		if (!worst) return false;
		const candidates = free.filter(
			(f) => f.element === worst && world.time - f.bornAt >= MIN_FADE_AGE,
		);
		const view = this.view?.();
		const offscreen = view ? candidates.filter((f) => !inside(view, f.at)) : [];
		const victim = (offscreen[0] ?? candidates[0])?.entity;
		if (!victim) return false;
		world.fade(victim);
		return true;
	}

	private share(i: number): number {
		return (
			(this.table.cumulative[i] ?? 0) -
			(i > 0 ? (this.table.cumulative[i - 1] ?? 0) : 0)
		);
	}
}

function countBy(free: { element: Element }[]): Record<Element, number> {
	const out: Record<Element, number> = {};
	for (const f of free) out[f.element] = (out[f.element] ?? 0) + 1;
	return out;
}

function inside(r: Rect, p: Point): boolean {
	return (
		p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
	);
}
