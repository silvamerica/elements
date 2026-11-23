import { describe, expect, it } from "vitest";
import { REACTIONS, type Reaction } from "../chemistry/reactions";
import { chanceOf, spawnTable, WORLDS } from "../chemistry/worlds";
import { type Entity, LOOSE_MS } from "../world/world";
import { Game } from "./game";
import { type KeyValue, readSave, SAVE_KEY, writeSave } from "./save";

const SIZE = { width: 900, height: 700 };

function summary(game: Game): string[] {
	return [...game.world.all()]
		.map((e: Entity) =>
			e.kind === "atoms"
				? `atoms:${game.world
						.circlesOf(e)
						.map((p) => (p.plugin as { element: string }).element)
						.sort()
						.join("")}`
				: e.kind === "molecule"
					? `molecule:${e.recipe.id}`
					: `structure:${e.recipe.id}x${e.members.length}`,
		)
		.sort();
}

function memoryStore(): KeyValue & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k),
	};
}

describe("worlds", () => {
	it("each world's spawn odds favour its own elements and leave room for strays", () => {
		for (const kind of WORLDS) {
			const table = spawnTable(kind);
			expect(table.cumulative.at(-1)).toBe(1);
			const top = Object.entries(kind.abundance).sort(
				(a, b) => b[1] - a[1],
			)[0]?.[0] as string;
			expect(chanceOf(table, top)).toBeGreaterThan(0.02);
			expect(table.elements).not.toContain("Tc");
		}
	});
});

describe("Game", () => {
	it("is decided entirely by its seed", () => {
		const a = Game.create(1234, SIZE);
		const b = Game.create(1234, SIZE);
		expect(a.kind.id).toBe(b.kind.id);
		expect(summary(a)).toEqual(summary(b));
		const picks = (g: Game) => Array.from({ length: 30 }, () => g.mode.pick());
		expect(picks(a)).toEqual(picks(b));
	});

	it("different seeds land in different worlds", () => {
		const kinds = new Set(
			Array.from(
				{ length: 40 },
				(_, i) => Game.create(i * 7919 + 1, SIZE).kind.id,
			),
		);
		expect(kinds.size).toBeGreaterThan(3);
	});

	it("saves and restores the board, discoveries and random sequence", () => {
		const game = Game.create(99, SIZE);
		const { world } = game;
		const h1 = world.spawnAtom("H", { x: 100, y: 100 });
		const h2 = world.spawnAtom("H", { x: 125, y: 100 });
		world.tryBond(h1, h2);
		const w1 = world.spawnMolecule("H2O", { x: 400, y: 300 });
		const w2 = world.spawnMolecule("H2O", { x: 450, y: 300 });
		const w3 = world.spawnMolecule("H2O", { x: 425, y: 350 });
		world.tryBond(w1, w2);
		const s = [...world.all()].find((e) => e.kind === "structure") as Entity;
		world.tryBond(w3, s);
		const c = world.spawnAtom("C", { x: 600, y: 500 });
		const h = world.spawnAtom("H", { x: 630, y: 500 });
		world.tryBond(c, h);
		for (let i = 0; i < 60; i++) game.tick(16.7);

		const store = memoryStore();
		expect(writeSave(store, game.toSave())).toBe(true);
		const saved = readSave(store);
		expect(saved).toBeDefined();
		const back = Game.restore(saved as NonNullable<typeof saved>, SIZE) as Game;

		expect(back.kind.id).toBe(game.kind.id);
		expect(summary(back)).toEqual(summary(game));
		expect(
			back
				.discoveries()
				.map((d) => d.key)
				.sort(),
		).toEqual(
			game
				.discoveries()
				.map((d) => d.key)
				.sort(),
		);
		expect(back.discoveries().some((d) => d.text.startsWith("Droplet"))).toBe(
			true,
		);
		const next = (g: Game) => Array.from({ length: 10 }, () => g.mode.pick());
		expect(next(back)).toEqual(next(game));
	});

	it("picks up a world saved under the old Water name and moves it", () => {
		const store = memoryStore();
		const save = Game.create(9, SIZE).toSave();
		store.data.set("water.save.v1", JSON.stringify(save));
		expect(readSave(store)?.seed).toBe(9);
		writeSave(store, save);
		expect(store.data.has("water.save.v1")).toBe(false);
		expect(readSave(store)?.seed).toBe(9);
	});

	it("starts fresh rather than crashing on a bad save", () => {
		const store = memoryStore();
		store.data.set(SAVE_KEY, "{not json");
		expect(readSave(store)).toBeUndefined();
		store.data.set(SAVE_KEY, JSON.stringify({ version: 1, seed: 1 }));
		expect(readSave(store)).toBeUndefined();
		const odd = { ...Game.create(5, SIZE).toSave(), worldKind: "venus" };
		expect(Game.restore(odd, SIZE)).toBeUndefined();
	});
});

describe("reaction discoveries", () => {
	it("records a reaction and its products, and keeps them through a save", () => {
		const game = Game.create(21, SIZE);
		const { world } = game;
		const reaction = REACTIONS.find((r) => r.id === "sodium-water");
		world.events.emit("reacted", {
			reaction: reaction as Reaction,
			at: { x: 100, y: 100 },
		});
		expect(game.knownReactions().has("sodium-water")).toBe(true);
		expect(game.knownMolecules().has("HNaO")).toBe(true);
		const back = Game.restore(game.toSave(), SIZE) as Game;
		expect(back.knownReactions().has("sodium-water")).toBe(true);
		expect(
			back.discoveries().some((d) => d.text.startsWith("Sodium fizzes")),
		).toBe(true);
	});
});

describe("camera in saves", () => {
	it("keeps where you were looking, and drops a garbled view", () => {
		const store = memoryStore();
		const base = Game.create(8, SIZE).toSave();
		writeSave(store, { ...base, camera: { x: 1200, y: 800, zoom: 2.5 } });
		expect(readSave(store)?.camera).toEqual({ x: 1200, y: 800, zoom: 2.5 });

		store.data.set(
			SAVE_KEY,
			JSON.stringify({ ...base, camera: { x: "left", y: 1, zoom: 1 } }),
		);
		const read = readSave(store);
		expect(read).toBeDefined();
		expect(read?.camera).toBeUndefined();
	});

	it("loads a screen-sized save into the bigger world, spread to fit", () => {
		const small = Game.create(11, { width: 800, height: 500 });
		const save = small.toSave();
		const big = Game.restore(save, { width: 3200, height: 2000 }) as Game;
		expect(summary(big)).toEqual(summary(small));
		for (const e of big.world.all())
			for (const p of big.world.circlesOf(e)) {
				expect(p.position.x).toBeLessThanOrEqual(3200);
				expect(p.position.y).toBeLessThanOrEqual(2000);
			}
		const xs = [...big.world.all()].flatMap((e) =>
			big.world.circlesOf(e).map((p) => p.position.x),
		);
		expect(Math.max(...xs)).toBeGreaterThan(800);
	});
});

describe("loose clusters", () => {
	it("fall apart when left unfinished", () => {
		const game = Game.create(3, SIZE);
		const { world } = game;
		const c = world.spawnAtom("C", { x: 300, y: 300 });
		const h = world.spawnAtom("H", { x: 330, y: 300 });
		expect(world.tryBond(c, h)).toBe("loose");
		const clusters = () =>
			[...world.all()].filter((e) => e.kind === "atoms" && e.bodies.length > 1)
				.length;
		expect(clusters()).toBe(1);
		for (let t = 0; t < LOOSE_MS - 1000; t += 100) world.step(100);
		expect(clusters()).toBe(1);
		for (let t = 0; t < 2000; t += 100) world.step(100);
		expect(clusters()).toBe(0);
	});

	it("start their clock over whenever they're handled", () => {
		const game = Game.create(4, SIZE);
		const { world } = game;
		const c = world.spawnAtom("C", { x: 300, y: 300 });
		const h = world.spawnAtom("H", { x: 330, y: 300 });
		world.tryBond(c, h);
		const cluster = () =>
			[...world.all()].find((e) => e.kind === "atoms" && e.bodies.length > 1);
		for (let t = 0; t < LOOSE_MS - 2000; t += 100) world.step(100);
		const held = cluster();
		expect(held && world.timeLeft(held)).toBeLessThan(2500);
		world.touch(held as Entity);
		expect(world.timeLeft(held as Entity)).toBe(LOOSE_MS);
		for (let t = 0; t < LOOSE_MS - 2000; t += 100) world.step(100);
		expect(cluster()).toBeDefined();
		for (let t = 0; t < 3000; t += 100) world.step(100);
		expect(cluster()).toBeUndefined();
	});
});
