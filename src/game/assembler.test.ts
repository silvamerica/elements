import { describe, expect, it } from "vitest";
import type { WorldEvents } from "../world/events";
import { type Entity, World } from "../world/world";
import { Assembler } from "./assembler";

function setup() {
	const world = new World({ width: 2000, height: 1400 });
	const snapped: string[] = [];
	world.events.on("snapped", (e: WorldEvents["snapped"]) =>
		snapped.push(e.recipe.id),
	);
	return { world, snapped };
}

function run(world: World, asm: Assembler, ms = 4000) {
	for (let t = 0; t < ms && asm.inFlight() > 0; t += 16) {
		world.step(16);
		asm.update(16);
	}
}

const kinds = (world: World) =>
	[...world.all()]
		.map((e) =>
			e.kind === "atoms"
				? `atoms${e.bodies.length}`
				: `${e.kind}:${e.recipe.id}`,
		)
		.sort();

describe("Assembler", () => {
	it("pulls the nearest free atoms to the spot and snaps the molecule", () => {
		const { world, snapped } = setup();
		world.spawnAtom("Na", { x: 300, y: 300 });
		world.spawnAtom("Cl", { x: 900, y: 500 });
		world.spawnAtom("Cl", { x: 1800, y: 1300 }); // farther, should stay
		const asm = new Assembler(world);
		const plan = asm.place("ClNa", { x: 600, y: 400 });
		expect(plan.ok).toBe(true);
		run(world, asm);
		expect(snapped).toEqual(["ClNa"]);
		expect(kinds(world)).toEqual(["atoms1", "molecule:ClNa"]);
		const far = [...world.all()].find((e) => e.kind === "atoms") as Entity;
		expect(world.centroidOf(far).x).toBeGreaterThan(1500);
	});

	it("uses an unfinished cluster before loose atoms", () => {
		const { world } = setup();
		const c = world.spawnAtom("C", { x: 500, y: 500 });
		const h = world.spawnAtom("H", { x: 530, y: 500 });
		world.tryBond(c, h);
		for (let i = 0; i < 5; i++)
			world.spawnAtom("H", { x: 200 + i * 60, y: 900 });
		world.spawnAtom("C", { x: 1000, y: 1000 });
		const asm = new Assembler(world);
		const plan = asm.place("CH4", { x: 700, y: 700 });
		expect(
			plan.ok &&
				plan.pieces.some((p) => p.kind === "atoms" && p.bodies.length === 2),
		).toBe(true);
		run(world, asm);
		const left = kinds(world);
		expect(left).toContain("molecule:CH4");
		expect(left.filter((k) => k === "atoms1")).toHaveLength(3); // spare C + 2 H
	});

	it("says what's short and moves nothing", () => {
		const { world } = setup();
		world.spawnAtom("H", { x: 300, y: 300 });
		const asm = new Assembler(world);
		const plan = asm.place("H2O", { x: 500, y: 500 });
		expect(plan.ok).toBe(false);
		expect(!plan.ok && plan.short).toMatchObject({ H: 1, O: 1 });
		expect(asm.inFlight()).toBe(0);
	});

	it("never takes finished molecules", () => {
		const { world } = setup();
		world.spawnMolecule("H2", { x: 300, y: 300 });
		world.spawnAtom("O", { x: 400, y: 300 });
		const asm = new Assembler(world);
		expect(asm.place("H2O", { x: 500, y: 500 }).ok).toBe(false);
	});

	it("joins a same-kind structure when placed beside it, climbing its tier", () => {
		const { world } = setup();
		const a = world.spawnMolecule("H2O", { x: 800, y: 600 });
		const b = world.spawnMolecule("H2O", { x: 850, y: 600 });
		world.tryBond(a, b);
		const s = [...world.all()].find((e) => e.kind === "structure") as Entity;
		world.spawnAtom("H", { x: 300, y: 300 });
		world.spawnAtom("H", { x: 1500, y: 300 });
		world.spawnAtom("O", { x: 300, y: 1200 });
		const asm = new Assembler(world);
		const plan = asm.place("H2O", { x: 860, y: 640 }, s);
		expect(plan.ok && plan.join).toBe(s);
		run(world, asm);
		const after = [...world.all()].find((e) => e.kind === "structure");
		expect(after?.kind === "structure" && after.members.length).toBe(3);
		expect(after?.kind === "structure" && after.tier?.name).toBe("Droplet");
	});

	it("cancels cleanly if a piece is grabbed mid-flight", () => {
		const { world, snapped } = setup();
		const na = world.spawnAtom("Na", { x: 200, y: 200 });
		world.spawnAtom("Cl", { x: 1800, y: 1200 });
		let grabbed: Entity | undefined;
		const asm = new Assembler(world, (e) => e === grabbed);
		asm.place("ClNa", { x: 1000, y: 700 });
		expect(world.isGhost(na)).toBe(true);
		world.step(16);
		asm.update(16);
		grabbed = na;
		asm.update(16);
		expect(asm.inFlight()).toBe(0);
		expect(snapped).toEqual([]);
		expect([...world.all()].every((e) => !world.isGhost(e))).toBe(true);
	});

	it("doesn't hand the same atoms to two assemblies at once", () => {
		const { world } = setup();
		world.spawnAtom("Na", { x: 300, y: 300 });
		world.spawnAtom("Cl", { x: 400, y: 300 });
		const asm = new Assembler(world);
		expect(asm.place("ClNa", { x: 600, y: 400 }).ok).toBe(true);
		expect(asm.place("ClNa", { x: 600, y: 400 }).ok).toBe(false);
	});
});
