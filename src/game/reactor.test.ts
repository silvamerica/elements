import { describe, expect, it } from "vitest";
import { equation, REACTIONS, validateReactions } from "../chemistry/reactions";
import type { WorldEvents } from "../world/events";
import { type Entity, World } from "../world/world";
import { HEAT_MS, Reactor, speciesOf } from "./reactor";

function setup() {
	const world = new World({ width: 3000, height: 2000 });
	const reacted: string[] = [];
	world.events.on("reacted", (e: WorldEvents["reacted"]) =>
		reacted.push(e.reaction.id),
	);
	return { world, reactor: new Reactor(world), reacted };
}

const kinds = (world: World) =>
	[...world.all()]
		.map((e) =>
			e.kind === "molecule" ? e.recipe.id : (speciesOf(e) ?? e.kind),
		)
		.sort();

describe("reaction table", () => {
	it("balances every equation and names only real species", () => {
		expect(validateReactions()).toEqual([]);
		expect(REACTIONS.length).toBeGreaterThanOrEqual(35);
	});

	it("writes equations readably", () => {
		const methane = REACTIONS.find((r) => r.id === "methane-burns");
		expect(methane && equation(methane)).toBe("CH₄ + 2 O₂ → CO₂ + 2 H₂O");
	});
});

describe("Reactor.drop", () => {
	it("burns methane when flung onto oxygen with a second oxygen nearby", () => {
		const { world, reactor, reacted } = setup();
		const ch4 = world.spawnMolecule("CH4", { x: 500, y: 500 });
		const o2 = world.spawnMolecule("O2", { x: 540, y: 500 });
		world.spawnMolecule("O2", { x: 600, y: 540 });
		const r = reactor.drop(ch4, o2, true);
		expect(r.kind).toBe("reacted");
		expect(reacted).toEqual(["methane-burns"]);
		expect(kinds(world)).toEqual(["CO2", "H2O", "H2O"]);
	});

	it("says it needs a spark when everything's there but it wasn't flung", () => {
		const { world, reactor } = setup();
		const ch4 = world.spawnMolecule("CH4", { x: 500, y: 500 });
		const o2 = world.spawnMolecule("O2", { x: 540, y: 500 });
		world.spawnMolecule("O2", { x: 600, y: 540 });
		const r = reactor.drop(ch4, o2, false);
		expect(r.kind === "needs-heat" && r.reaction.id).toBe("methane-burns");
		expect(kinds(world)).toEqual(["CH4", "O2", "O2"]);
	});

	it("says what's missing when a piece isn't nearby", () => {
		const { world, reactor } = setup();
		const ch4 = world.spawnMolecule("CH4", { x: 500, y: 500 });
		const o2 = world.spawnMolecule("O2", { x: 540, y: 500 });
		world.spawnMolecule("O2", { x: 1500, y: 1500 }); // too far
		const r = reactor.drop(ch4, o2, true);
		expect(r.kind === "incomplete" && r.missing).toEqual({ O2: 1 });
	});

	it("goes without heat when the reaction doesn't need it (sodium in water)", () => {
		const { world, reactor } = setup();
		const na = world.spawnAtom("Na", { x: 500, y: 500 });
		const water = world.spawnMolecule("H2O", { x: 540, y: 500 });
		world.spawnAtom("Na", { x: 560, y: 560 });
		world.spawnMolecule("H2O", { x: 470, y: 560 });
		expect(reactor.drop(na, water, false).kind).toBe("reacted");
		expect(kinds(world)).toEqual(["H2", "HNaO", "HNaO"]);
	});

	it("leaves a catalyst untouched", () => {
		const { world, reactor } = setup();
		const p1 = world.spawnMolecule("H2O2", { x: 500, y: 500 });
		const mno2 = world.spawnMolecule("MnO2", { x: 545, y: 500 });
		world.spawnMolecule("H2O2", { x: 520, y: 560 });
		const r = reactor.drop(p1, mno2, false);
		expect(r.kind).toBe("reacted");
		expect(world.get(mno2.id)).toBe(mno2);
		expect(kinds(world)).toEqual(["H2O", "H2O", "MnO2", "O2"]);
	});

	it("wants the catalyst before it'll go", () => {
		const { world, reactor } = setup();
		const a = world.spawnMolecule("H2O2", { x: 500, y: 500 });
		const b = world.spawnMolecule("H2O2", { x: 545, y: 500 });
		const r = reactor.drop(a, b, true);
		expect(r.kind === "incomplete" && r.missing).toEqual({ MnO2: 1 });
	});

	it("ignores pairs no reaction involves", () => {
		const { world, reactor } = setup();
		const a = world.spawnMolecule("CO2", { x: 500, y: 500 });
		const b = world.spawnAtom("Ar", { x: 540, y: 500 });
		expect(reactor.drop(a, b, true).kind).toBe("none");
	});

	it("never reacts loose clusters or structures", () => {
		const { world, reactor } = setup();
		const c = world.spawnAtom("C", { x: 500, y: 500 });
		const h = world.spawnAtom("H", { x: 530, y: 500 });
		world.tryBond(c, h);
		const cluster = [...world.all()][0] as Entity;
		const o2 = world.spawnMolecule("O2", { x: 560, y: 500 });
		expect(reactor.drop(cluster, o2, true).kind).toBe("none");
	});
});

describe("heat and chains", () => {
	it("a hot reaction sets off a complete set of reactants nearby", () => {
		const { world, reactor, reacted } = setup();
		// Hydrogen bang here...
		const h2 = world.spawnMolecule("H2", { x: 500, y: 500 });
		const o2 = world.spawnMolecule("O2", { x: 540, y: 500 });
		world.spawnMolecule("H2", { x: 500, y: 560 });
		// ...with methane and oxygen sitting just beyond reach of the drop.
		world.spawnMolecule("CH4", { x: 640, y: 500 });
		world.spawnMolecule("O2", { x: 680, y: 500 });
		world.spawnMolecule("O2", { x: 660, y: 550 });
		expect(reactor.drop(h2, o2, true).kind).toBe("reacted");
		expect(reactor.isHot({ x: 520, y: 500 })).toBe(true);
		for (let t = 0; t < 200; t += 16) reactor.update(16);
		expect(reacted).toEqual(["hydrogen-burns", "methane-burns"]);
	});

	it("fire doesn't make lightning chemistry", () => {
		const { world, reactor, reacted } = setup();
		const h2 = world.spawnMolecule("H2", { x: 500, y: 500 });
		const o2 = world.spawnMolecule("O2", { x: 540, y: 500 });
		world.spawnMolecule("H2", { x: 500, y: 560 });
		world.spawnMolecule("O2", { x: 640, y: 480 });
		world.spawnMolecule("O2", { x: 680, y: 520 });
		world.spawnMolecule("O2", { x: 640, y: 560 });
		reactor.drop(h2, o2, true);
		for (let t = 0; t < 400; t += 16) reactor.update(16);
		expect(reacted).toEqual(["hydrogen-burns"]);
	});

	it("heat fades", () => {
		const { world, reactor } = setup();
		const h2 = world.spawnMolecule("H2", { x: 500, y: 500 });
		const o2 = world.spawnMolecule("O2", { x: 540, y: 500 });
		world.spawnMolecule("H2", { x: 500, y: 560 });
		reactor.drop(h2, o2, true);
		reactor.update(HEAT_MS + 10);
		expect(reactor.isHot({ x: 520, y: 500 })).toBe(false);
	});

	it("an unflung drop inside heat still goes", () => {
		const { world, reactor, reacted } = setup();
		const h2 = world.spawnMolecule("H2", { x: 500, y: 500 });
		const o2 = world.spawnMolecule("O2", { x: 540, y: 500 });
		world.spawnMolecule("H2", { x: 500, y: 560 });
		reactor.drop(h2, o2, true);
		const c = world.spawnAtom("C", { x: 2000, y: 1500 });
		const far = world.spawnMolecule("O2", { x: 2040, y: 1500 });
		expect(reactor.drop(c, far, false).kind).toBe("needs-heat");
		const c2 = world.spawnAtom("C", { x: 560, y: 470 });
		const near = world.spawnMolecule("O2", { x: 600, y: 470 });
		expect(reactor.drop(c2, near, false).kind).toBe("reacted");
		expect(reacted).toContain("carbon-burns");
	});
});
