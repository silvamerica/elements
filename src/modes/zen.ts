import type { Element } from "../chemistry/elements";
import type { World } from "../world/world";
import type { Mode } from "./mode";

export interface ZenOptions {
	/** Milliseconds between spawns. */
	interval?: number;
	/** Free single atoms on screen before spawning pauses. */
	cap?: number;
	/** Atoms placed at the start so the canvas isn't empty. */
	seed?: number;
	random?: () => number;
}

const WEIGHTS: [Element, number][] = [
	["H", 50],
	["O", 30],
	["C", 12],
	["N", 8],
];

/** No score, no failure: atoms trickle in and wait for you. */
export class ZenMode implements Mode {
	readonly name = "Zen";
	private world: World | undefined;
	private sinceSpawn = 0;
	private readonly interval: number;
	private readonly cap: number;
	private readonly seed: number;
	private readonly random: () => number;

	constructor(opts: ZenOptions = {}) {
		this.interval = opts.interval ?? 2500;
		this.cap = opts.cap ?? 60;
		this.seed = opts.seed ?? 14;
		this.random = opts.random ?? Math.random;
	}

	start(world: World): void {
		this.world = world;
		for (let i = 0; i < this.seed; i++) world.spawnAtom(this.pick());
	}

	update(dtMs: number): void {
		const world = this.world;
		if (!world) return;
		this.sinceSpawn += dtMs;
		if (this.sinceSpawn < this.interval) return;
		this.sinceSpawn = 0;
		if (world.freeAtomCount() < this.cap) world.spawnAtom(this.pick());
	}

	stop(): void {
		this.world = undefined;
	}

	pick(): Element {
		const total = WEIGHTS.reduce((n, [, w]) => n + w, 0);
		let roll = this.random() * total;
		for (const [el, w] of WEIGHTS) {
			roll -= w;
			if (roll < 0) return el;
		}
		return "H";
	}
}
