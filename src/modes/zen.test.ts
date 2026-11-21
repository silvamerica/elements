import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { ZenMode } from "./zen";

describe("ZenMode", () => {
	it("seeds the canvas and trickles atoms in up to the cap", () => {
		const world = new World({ width: 800, height: 600 });
		const zen = new ZenMode({ interval: 100, cap: 20, seed: 5 });
		zen.start(world);
		expect(world.freeAtomCount()).toBe(5);
		for (let i = 0; i < 100; i++) zen.update(100);
		expect(world.freeAtomCount()).toBe(20);
	});

	it("picks mostly hydrogen and oxygen", () => {
		const zen = new ZenMode();
		const counts: Record<string, number> = {};
		for (let i = 0; i < 2000; i++) {
			const el = zen.pick();
			counts[el] = (counts[el] ?? 0) + 1;
		}
		expect((counts.H ?? 0) + (counts.O ?? 0)).toBeGreaterThan(1400);
		expect(counts.N ?? 0).toBeGreaterThan(0);
	});
});
