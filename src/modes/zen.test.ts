import { describe, expect, it } from "vitest";
import { chanceOf, spawnTable, worldKind } from "../chemistry/worlds";
import type { WorldEvents } from "../world/events";
import { Rng } from "../world/rng";
import { World } from "../world/world";
import { ZenMode } from "./zen";

const ocean = spawnTable(worldKind("ocean"));

function setup(
	seed: number,
	opts: Partial<ConstructorParameters<typeof ZenMode>[0]> = {},
) {
	const rng = new Rng(seed);
	const world = new World({ width: 3200, height: 2000, random: rng.fn });
	const zen = new ZenMode({
		table: ocean,
		random: rng.fn,
		interval: 100,
		cap: 100,
		seed: 0,
		...opts,
	});
	zen.start(world);
	return { world, zen };
}

function pool(world: World): Record<string, number> {
	const out: Record<string, number> = {};
	for (const f of world.freeAtoms()) out[f.element] = (out[f.element] ?? 0) + 1;
	return out;
}

describe("ZenMode", () => {
	it("seeds a new board but not a restored one", () => {
		const { world } = setup(1, { seed: 12 });
		expect(world.freeAtomCount()).toBe(12);
		const rng = new Rng(1);
		const w2 = new World({ width: 800, height: 600, random: rng.fn });
		new ZenMode({ table: ocean, random: rng.fn, seed: 12 }).start(w2, false);
		expect(w2.freeAtomCount()).toBe(0);
	});

	it("draws an ocean mostly as hydrogen and oxygen", () => {
		const { zen } = setup(7);
		const counts: Record<string, number> = {};
		for (let i = 0; i < 5000; i++) {
			const el = zen.pick();
			counts[el] = (counts[el] ?? 0) + 1;
		}
		const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
		expect(
			top
				.slice(0, 2)
				.map(([el]) => el)
				.sort(),
		).toEqual(["H", "O"]);
		expect(top.length).toBeGreaterThan(15);
	});

	it("tops up whatever has been used", () => {
		const { zen } = setup(3);
		const full: Record<string, number> = {};
		for (const el of ocean.elements)
			full[el] = Math.round(chanceOf(ocean, el) * 100);
		const noH = { ...full, H: 0 };
		let h = 0;
		for (let i = 0; i < 200; i++) if (zen.pickToRefill(noH) === "H") h++;
		expect(h).toBeGreaterThan(150);
	});

	it("keeps the free pool in the world's proportions as you use it up", () => {
		const { world, zen } = setup(5);
		for (let i = 0; i < 400; i++) zen.update(100);
		expect(world.freeAtomCount()).toBe(100);
		// Use up every hydrogen and oxygen, then let it refill.
		for (const f of world.freeAtoms())
			if (f.element === "H" || f.element === "O") world.fade(f.entity);
		for (let i = 0; i < 300; i++) zen.update(100);
		const p = pool(world);
		const total = Object.values(p).reduce((a, b) => a + b, 0);
		expect(total).toBe(100);
		for (const el of ["H", "O"]) {
			const want = chanceOf(ocean, el);
			expect((p[el] ?? 0) / total).toBeGreaterThan(want * 0.6);
		}
	});

	it("fades the oldest over-supplied leftover when the board is full", () => {
		const { world, zen } = setup(9, { cap: 30 });
		for (let i = 0; i < 30; i++)
			world.spawnAtom("K", { x: 100 + i * 40, y: 100 });
		const faded: WorldEvents["faded"][] = [];
		world.events.on("faded", (e) => faded.push(e));
		const oldest = world.freeAtoms()[0]?.entity;
		zen.update(100);
		expect(faded.map((f) => f.element)).toEqual(["K"]);
		expect(oldest && world.get(oldest.id)).toBeUndefined();
		expect(world.freeAtomCount()).toBe(30);
		expect(pool(world).K).toBe(29);
	});

	it("spawns fast when the pool is low and slows as it fills", () => {
		const { zen } = setup(2, { interval: 1500, fastInterval: 330 });
		expect(zen.currentInterval(10)).toBe(330);
		expect(zen.currentInterval(75)).toBeCloseTo(915);
		expect(zen.currentInterval(100)).toBe(1500);
	});

	it("puts most new atoms where you're looking", () => {
		const { world, zen } = setup(4);
		const view = { x: 1000, y: 600, width: 800, height: 500 };
		zen.view = () => view;
		let inside = 0;
		for (let i = 0; i < 1000; i++) {
			const p = zen.place(world, "H");
			if (p && p.x >= 1000 && p.x <= 1800 && p.y >= 600 && p.y <= 1100)
				inside++;
		}
		expect(inside).toBeGreaterThan(640);
		expect(inside).toBeLessThan(760);
	});

	it("is reproducible from the seed", () => {
		const run = () => {
			const { world, zen } = setup(77);
			for (let i = 0; i < 150; i++) zen.update(100);
			return world.freeAtoms().map((f) => `${f.element}@${Math.round(f.at.x)}`);
		};
		expect(run()).toEqual(run());
	});
});
