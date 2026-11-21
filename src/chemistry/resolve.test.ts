import { describe, expect, it } from "vitest";
import { addCounts, atomList, formulaKey } from "./elements";
import { resolveAtoms, tierFor, validateTables } from "./resolve";

describe("resolveAtoms", () => {
	it("snaps an exact recipe", () => {
		const r = resolveAtoms({ H: 2, O: 1 });
		expect(r.kind === "snap" && r.recipe.id).toBe("H2O");
	});

	it("snaps H+H into H2, and H2+O into H2O", () => {
		const h2 = resolveAtoms(addCounts({ H: 1 }, { H: 1 }));
		expect(h2.kind === "snap" && h2.recipe.id).toBe("H2");
		const water = resolveAtoms(addCounts({ H: 2 }, { O: 1 }));
		expect(water.kind === "snap" && water.recipe.id).toBe("H2O");
	});

	it("keeps a partial cluster loose", () => {
		expect(resolveAtoms({ C: 1, H: 2 }).kind).toBe("loose");
		expect(resolveAtoms({ N: 1, H: 1 }).kind).toBe("loose");
	});

	it("fizzles what no recipe contains", () => {
		expect(resolveAtoms({ C: 1, N: 1 }).kind).toBe("fizzle");
		expect(resolveAtoms({ H: 5 }).kind).toBe("fizzle");
		expect(resolveAtoms({}).kind).toBe("fizzle");
	});

	it("treats a single atom as loose (it can grow)", () => {
		expect(resolveAtoms({ O: 1 }).kind).toBe("loose");
	});
});

describe("tierFor", () => {
	it("climbs a named ladder", () => {
		expect(tierFor("H2O", 2)).toBeUndefined();
		expect(tierFor("H2O", 3)?.name).toBe("Droplet");
		expect(tierFor("H2O", 7)?.name).toBe("Droplet");
		expect(tierFor("H2O", 8)?.name).toBe("Puddle");
		expect(tierFor("H2O", 50)?.name).toBe("Ice crystal");
	});

	it("falls back for molecules without one", () => {
		expect(tierFor("NH3", 3)?.name).toBe("Cluster");
		expect(tierFor("H2O2", 20)?.name).toBe("Nebula");
	});
});

describe("tables", () => {
	it("are valid", () => {
		expect(validateTables()).toEqual([]);
	});
});

describe("elements helpers", () => {
	it("formats and flattens", () => {
		expect(formulaKey({ O: 1, H: 2 })).toBe("H2O");
		expect(formulaKey({ O: 2, C: 1 })).toBe("CO2");
		expect(atomList({ H: 2, O: 1 })).toEqual(["H", "H", "O"]);
	});
});
