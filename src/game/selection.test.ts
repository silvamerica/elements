import { describe, expect, it } from "vitest";
import type { Entity } from "../world/world";
import { World } from "../world/world";
import { GUIDE_MS, Selection } from "./selection";

function setup() {
	const world = new World({ width: 1000, height: 800 });
	return { world, sel: new Selection(world) };
}

describe("Selection", () => {
	it("follows the selected entity into what it bonds into", () => {
		const { world, sel } = setup();
		const h1 = world.spawnAtom("H", { x: 100, y: 100 });
		const h2 = world.spawnAtom("H", { x: 125, y: 100 });
		sel.select(h1);
		world.tryBond(h1, h2);
		const now = sel.current();
		expect(now?.kind === "molecule" && now.recipe.id).toBe("H2");

		const o = world.spawnAtom("O", { x: 150, y: 100 });
		world.tryBond(o, now as Entity);
		const water = sel.current();
		expect(water?.kind === "molecule" && water.recipe.id).toBe("H2O");
	});

	it("keeps the selection when a drop fizzles, and drops it when the thing is gone", () => {
		const { world, sel } = setup();
		const he = world.spawnAtom("He", { x: 100, y: 100 });
		const h = world.spawnAtom("H", { x: 130, y: 100 });
		sel.select(he);
		world.tryBond(he, h);
		expect(sel.current()).toBe(he);
		world.fade(he);
		expect(sel.current()).toBeUndefined();
	});

	it("tells listeners when the selection changes", () => {
		const { world, sel } = setup();
		let calls = 0;
		sel.onChange(() => calls++);
		const h = world.spawnAtom("H", { x: 100, y: 100 });
		sel.select(h);
		sel.select(h);
		sel.clear();
		expect(calls).toBe(2);
	});

	it("points at the nearest atoms that would finish a molecule, and says what's short", () => {
		const { world, sel } = setup();
		const c = world.spawnAtom("C", { x: 500, y: 400 });
		const nearO = world.spawnAtom("O", { x: 560, y: 400 });
		world.spawnAtom("O", { x: 900, y: 700 });
		world.spawnAtom("O", { x: 60, y: 60 });
		sel.select(c);
		const short = sel.guideTo({ O: 2, N: 1 }, 0);
		expect(short).toEqual({ N: 1 });
		const guided = sel.guided(10);
		expect(guided).toHaveLength(2);
		expect(guided).toContain(nearO.bodies[0]);
		expect(sel.guided(GUIDE_MS + 1)).toEqual([]);
	});
});
