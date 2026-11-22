import { describe, expect, it } from "vitest";
import { formulaKey } from "../chemistry/elements";
import { layoutFor } from "../chemistry/layouts";
import { RECIPES } from "../chemistry/recipes";
import type { WorldEvents } from "./events";
import { type Entity, World } from "./world";

function seeded(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

function makeWorld() {
	const world = new World({ width: 800, height: 600, random: seeded(7) });
	const seen: (keyof WorldEvents)[] = [];
	world.events.on("*", (type) => seen.push(type));
	return { world, seen };
}

function only(world: World): Entity[] {
	return [...world.all()];
}

describe("World bonding", () => {
	it("H + H snaps into H2, then + O snaps into H2O", () => {
		const { world, seen } = makeWorld();
		const h1 = world.spawnAtom("H", { x: 100, y: 100 });
		const h2 = world.spawnAtom("H", { x: 125, y: 100 });
		expect(world.tryBond(h1, h2)).toBe("snap");
		const [h2mol] = only(world);
		expect(h2mol?.kind === "molecule" && h2mol.recipe.id).toBe("H2");

		const o = world.spawnAtom("O", { x: 150, y: 100 });
		expect(world.tryBond(o, h2mol as Entity)).toBe("snap");
		const all = only(world);
		expect(all).toHaveLength(1);
		const water = all[0];
		expect(water?.kind === "molecule" && water.recipe.id).toBe("H2O");
		expect(world.countsOf(water as Entity)).toEqual({ H: 2, O: 1 });
		expect(seen.filter((t) => t === "snapped")).toHaveLength(2);
	});

	it("keeps a partial cluster loose and snaps it when complete", () => {
		const { world } = makeWorld();
		const c = world.spawnAtom("C", { x: 300, y: 300 });
		const h = world.spawnAtom("H", { x: 330, y: 300 });
		expect(world.tryBond(c, h)).toBe("loose");
		let cluster = only(world)[0] as Entity;
		expect(cluster.kind).toBe("atoms");
		expect(world.springsOf(cluster)).toHaveLength(1);
		for (const y of [260, 340, 280]) {
			const more = world.spawnAtom("H", { x: 300, y });
			world.tryBond(more, cluster);
			cluster = only(world)[0] as Entity;
		}
		expect(cluster.kind === "molecule" && cluster.recipe.id).toBe("CH4");
	});

	it("fizzles a noble gas and leaves both in place", () => {
		const { world, seen } = makeWorld();
		const c = world.spawnAtom("He", { x: 100, y: 100 });
		const n = world.spawnAtom("H", { x: 140, y: 100 });
		expect(world.tryBond(c, n)).toBe("fizzle");
		expect(only(world)).toHaveLength(2);
		expect(seen).toContain("fizzled");
	});

	it("clumps same-kind molecules into a structure and names its tier", () => {
		const { world, seen } = makeWorld();
		const a = world.spawnMolecule("H2O", { x: 200, y: 200 });
		const b = world.spawnMolecule("H2O", { x: 250, y: 200 });
		expect(world.tryBond(a, b)).toBe("join");
		let s = only(world)[0] as Entity;
		expect(s.kind === "structure" && s.members.length).toBe(2);
		expect(s.kind === "structure" && s.tier).toBeUndefined();

		const c = world.spawnMolecule("H2O", { x: 225, y: 250 });
		expect(world.tryBond(c, s)).toBe("join");
		s = only(world)[0] as Entity;
		expect(s.kind === "structure" && s.tier?.name).toBe("Droplet");
		expect(seen).toContain("tierUp");
	});

	it("won't mix molecules into another kind's structure", () => {
		const { world } = makeWorld();
		const a = world.spawnMolecule("H2O", { x: 200, y: 200 });
		const b = world.spawnMolecule("H2O", { x: 250, y: 200 });
		world.tryBond(a, b);
		const s = only(world)[0] as Entity;
		const co2 = world.spawnMolecule("CO2", { x: 300, y: 200 });
		expect(world.tryBond(co2, s)).toBe("fizzle");
	});

	it("combines different molecules by atom count (H2 + O2 = H2O2)", () => {
		const { world } = makeWorld();
		const h2 = world.spawnMolecule("H2", { x: 100, y: 100 });
		const o2 = world.spawnMolecule("O2", { x: 150, y: 100 });
		expect(world.tryBond(h2, o2)).toBe("snap");
		const m = only(world)[0];
		expect(m?.kind === "molecule" && m.recipe.id).toBe("H2O2");
	});

	it("splits molecules back into atoms and releases structure members", () => {
		const { world } = makeWorld();
		const w = world.spawnMolecule("H2O", { x: 200, y: 200 });
		world.split(w);
		expect(only(world).map((e) => e.kind)).toEqual(["atoms", "atoms", "atoms"]);

		const { world: w2 } = makeWorld();
		const a = w2.spawnMolecule("O2", { x: 200, y: 200 });
		const b = w2.spawnMolecule("O2", { x: 260, y: 200 });
		w2.tryBond(a, b);
		w2.split(only(w2)[0] as Entity);
		expect(only(w2).map((e) => e.kind)).toEqual(["molecule", "molecule"]);
	});

	it("finds what a dropped entity is touching", () => {
		const { world } = makeWorld();
		const h = world.spawnAtom("H", { x: 100, y: 100 });
		const o = world.spawnAtom("O", { x: 132, y: 100 });
		world.spawnAtom("N", { x: 500, y: 500 });
		expect(world.bondTarget(h)).toBe(o);
		expect(world.entityAt({ x: 132, y: 100 })?.entity).toBe(o);
	});

	it("survives a few seconds of simulation with everything on screen", () => {
		const { world } = makeWorld();
		for (let i = 0; i < 40; i++) world.spawnAtom(i % 3 === 0 ? "O" : "H");
		const a = world.spawnMolecule("H2O", { x: 400, y: 300 });
		const b = world.spawnMolecule("H2O", { x: 450, y: 300 });
		world.tryBond(a, b);
		for (let i = 0; i < 300; i++) world.step(16.7);
		for (const e of world.all())
			for (const p of world.circlesOf(e)) {
				expect(p.position.x).toBeGreaterThan(-5);
				expect(p.position.x).toBeLessThan(805);
				expect(p.position.y).toBeGreaterThan(-5);
				expect(p.position.y).toBeLessThan(605);
			}
	});
});

describe("molecules built from parts", () => {
	it("won't snap CO₂ from loose pieces, only around a finished CO", () => {
		const { world, seen } = makeWorld();
		const c = world.spawnAtom("C", { x: 100, y: 100 });
		const o2 = world.spawnMolecule("O2", { x: 140, y: 100 });
		expect(world.predict(c, o2)).toMatchObject({
			outcome: "fizzle",
			needs: ["CO"],
		});
		expect(world.tryBond(c, o2)).toBe("fizzle");
		expect(seen).toContain("needsPart");

		const c2 = world.spawnAtom("C", { x: 400, y: 400 });
		const o = world.spawnAtom("O", { x: 430, y: 400 });
		expect(world.tryBond(c2, o)).toBe("snap"); // CO
		const co = only(world).find(
			(e) => e.kind === "molecule" && e.recipe.id === "CO",
		) as Entity;
		const o3 = world.spawnAtom("O", { x: 470, y: 400 });
		expect(world.tryBond(o3, co)).toBe("snap");
		expect(
			only(world).some((e) => e.kind === "molecule" && e.recipe.id === "CO2"),
		).toBe(true);
	});

	it("remembers a part through a loose cluster and a save", () => {
		const { world } = makeWorld();
		const no = world.spawnMolecule("NO", { x: 200, y: 200 });
		const cl = world.spawnAtom("Cl", { x: 240, y: 200 });
		// NO + Cl is exactly NOCl, which is built from NO: snaps.
		expect(world.tryBond(cl, no)).toBe("snap");

		const so2 = world.spawnMolecule("O2S", { x: 600, y: 600 });
		const cl1 = world.spawnAtom("Cl", { x: 640, y: 600 });
		expect(world.tryBond(cl1, so2)).toBe("loose");
		const cluster = only(world).find(
			(e) => e.kind === "atoms" && e.bodies.length > 1,
		) as Entity;
		expect(world.partsOf(cluster)).toEqual(["O2S"]);
		const snap = world.snapshot();
		const back = new World({ width: 800, height: 600 });
		back.load(snap);
		const again = [...back.all()].find(
			(e) => e.kind === "atoms" && e.bodies.length > 1,
		) as Entity;
		expect(back.partsOf(again)).toEqual(["O2S"]);
	});
});

describe("layouts", () => {
	it("place exactly each recipe's atoms", () => {
		for (const r of RECIPES) {
			const placed = layoutFor(r, () => 10);
			const counts: Record<string, number> = {};
			for (const p of placed) counts[p.el] = (counts[p.el] ?? 0) + 1;
			expect(formulaKey(counts)).toBe(formulaKey(r.formula));
		}
	});
});
