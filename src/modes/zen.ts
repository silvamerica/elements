import type { Element } from "../chemistry/elements";
import { pickElement, type SpawnTable } from "../chemistry/worlds";
import type { World } from "../world/world";
import type { Mode } from "./mode";

export interface ZenOptions {
	/** What spawns, and how often relative to each other. */
	table: SpawnTable;
	random: () => number;
	/** Milliseconds between spawns. */
	interval?: number;
	/** Free single atoms on screen before spawning pauses. */
	cap?: number;
	/** Atoms placed when a brand-new world starts. */
	seed?: number;
}

/** No score, no failure: atoms trickle in and wait for you. */
export class ZenMode implements Mode {
	readonly name = "Zen";
	private world: World | undefined;
	private sinceSpawn = 0;
	private readonly table: SpawnTable;
	private readonly random: () => number;
	private readonly interval: number;
	private readonly cap: number;
	private readonly seedCount: number;

	constructor(opts: ZenOptions) {
		this.table = opts.table;
		this.random = opts.random;
		this.interval = opts.interval ?? 2500;
		this.cap = opts.cap ?? 60;
		this.seedCount = opts.seed ?? 16;
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
		if (this.sinceSpawn < this.interval) return;
		this.sinceSpawn = 0;
		if (world.freeAtomCount() < this.cap) world.spawnAtom(this.pick());
	}

	stop(): void {
		this.world = undefined;
	}

	pick(): Element {
		return pickElement(this.table, this.random());
	}
}
