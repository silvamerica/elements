import { describe, expect, it } from "vitest";
import { spawnTable, worldKind } from "../chemistry/worlds";
import { Rng } from "../world/rng";
import { World } from "../world/world";
import { ZenMode } from "./zen";

describe("ZenMode", () => {
	const table = spawnTable(worldKind("ocean"));

	it("seeds the canvas and trickles atoms in up to the cap", () => {
		const rng = new Rng(42);
		const world = new World({ width: 800, height: 600, random: rng.fn });
		const zen = new ZenMode({
			table,
			random: rng.fn,
			interval: 100,
			cap: 20,
			seed: 5,
		});
		zen.start(world);
		expect(world.freeAtomCount()).toBe(5);
		for (let i = 0; i < 100; i++) zen.update(100);
		expect(world.freeAtomCount()).toBe(20);
	});

	it("doesn't reseed a restored board", () => {
		const rng = new Rng(1);
		const world = new World({ width: 800, height: 600, random: rng.fn });
		new ZenMode({ table, random: rng.fn, seed: 5 }).start(world, false);
		expect(world.freeAtomCount()).toBe(0);
	});

	it("spawns an ocean mostly as hydrogen and oxygen", () => {
		const rng = new Rng(7);
		const zen = new ZenMode({ table, random: rng.fn });
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
});
