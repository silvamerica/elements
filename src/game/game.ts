import { equation, REACTIONS } from "../chemistry/reactions";
import { findRecipe, RECIPES } from "../chemistry/recipes";
import {
	spawnTable,
	WORLDS,
	type WorldKind,
	worldKind,
} from "../chemistry/worlds";
import { ZenMode } from "../modes/zen";
import { Rng } from "../world/rng";
import { World } from "../world/world";
import type { SaveGame } from "./save";

/** The board: bigger than any screen; the camera pans and zooms over it. */
export const WORLD_SIZE = { width: 3200, height: 2000 };

export interface Discovery {
	key: string;
	text: string;
}

/**
 * One browser's world: the seed, the environment it picked, the board, the
 * zen spawner and what's been discovered. Knows nothing about drawing.
 */
export class Game {
	readonly world: World;
	readonly kind: WorldKind;
	readonly mode: ZenMode;
	readonly seed: number;
	private readonly rng: Rng;
	private readonly found = new Map<string, string>();
	private readonly listeners = new Set<(d: Discovery) => void>();

	private constructor(
		seed: number,
		rngState: number,
		kind: WorldKind,
		size: { width: number; height: number },
	) {
		this.seed = seed;
		this.rng = new Rng(rngState);
		this.kind = kind;
		this.world = new World({ ...size, random: this.rng.fn });
		this.mode = new ZenMode({
			table: spawnTable(kind),
			random: this.rng.fn,
			// Scaled to a world about three screens across.
			interval: 1500,
			fastInterval: 330,
			cap: 150,
			seed: 40,
		});

		this.world.events.on("snapped", ({ recipe }) =>
			this.discover(`m:${recipe.id}`, `${recipe.label} ${recipe.name}`),
		);
		this.world.events.on("reacted", ({ reaction }) => {
			this.discover(
				`r:${reaction.id}`,
				`${reaction.name}: ${equation(reaction)}`,
			);
			for (const id of Object.keys(reaction.products)) {
				const r = findRecipe(id);
				if (r) this.discover(`m:${r.id}`, `${r.label} ${r.name}`);
			}
		});
		this.world.events.on("tierUp", ({ recipe, tier }) =>
			this.discover(
				`s:${recipe.id}:${tier.name}`,
				`${tier.name} of ${recipe.label}`,
			),
		);
	}

	/** A brand-new world from a seed: the seed alone decides the environment and every spawn. */
	static create(seed: number, size: { width: number; height: number }): Game {
		const pickRng = new Rng(seed);
		const kind =
			WORLDS[Math.floor(pickRng.next() * WORLDS.length)] ??
			(WORLDS[0] as WorldKind);
		const game = new Game(seed, pickRng.state, kind, size);
		game.mode.start(game.world, true);
		return game;
	}

	/** Pick up exactly where a save left off. Returns undefined if the save names an unknown world. */
	static restore(
		save: SaveGame,
		size: { width: number; height: number },
	): Game | undefined {
		let kind: WorldKind;
		try {
			kind = worldKind(save.worldKind);
		} catch {
			return undefined;
		}
		const game = new Game(save.seed, save.rngState, kind, size);
		game.world.load(save.world);
		for (const key of save.discovered) game.found.set(key, describe(key));
		game.mode.start(game.world, false);
		return game;
	}

	tick(dtMs: number): void {
		this.world.step(dtMs);
		this.mode.update(dtMs);
	}

	toSave(): SaveGame {
		return {
			version: 1,
			seed: this.seed,
			rngState: this.rng.state,
			worldKind: this.kind.id,
			world: this.world.snapshot(),
			discovered: [...this.found.keys()],
		};
	}

	/** Short hex of the seed, for the corner label. */
	get seedLabel(): string {
		return this.seed.toString(16).padStart(8, "0").slice(0, 4);
	}

	discoveries(): Discovery[] {
		return [...this.found].map(([key, text]) => ({ key, text }));
	}

	/** Recipe ids made by hand at least once. */
	knownMolecules(): ReadonlySet<string> {
		const ids = new Set<string>();
		for (const key of this.found.keys())
			if (key.startsWith("m:")) ids.add(key.slice(2));
		return ids;
	}

	/** Reaction ids seen at least once. */
	knownReactions(): ReadonlySet<string> {
		const ids = new Set<string>();
		for (const key of this.found.keys())
			if (key.startsWith("r:")) ids.add(key.slice(2));
		return ids;
	}

	get reactionTotal(): number {
		return REACTIONS.length;
	}

	moleculesFound(): number {
		let n = 0;
		for (const key of this.found.keys()) if (key.startsWith("m:")) n++;
		return n;
	}

	get moleculeTotal(): number {
		return RECIPES.length;
	}

	onDiscover(fn: (d: Discovery) => void): void {
		this.listeners.add(fn);
	}

	private discover(key: string, text: string): void {
		if (this.found.has(key)) return;
		this.found.set(key, text);
		for (const fn of this.listeners) fn({ key, text });
	}
}

/** Rebuild a shelf line from its key (saves store keys only). */
function describe(key: string): string {
	const [kind, id, tier] = key.split(":");
	if (kind === "r") {
		const reaction = REACTIONS.find((r) => r.id === id);
		return reaction ? `${reaction.name}: ${equation(reaction)}` : (id ?? key);
	}
	const recipe = RECIPES.find((r) => r.id === id);
	if (!recipe) return id ?? key;
	return kind === "s"
		? `${tier} of ${recipe.label}`
		: `${recipe.label} ${recipe.name}`;
}
