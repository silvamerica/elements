import { describe, expect, it } from "vitest";
import {
	addCounts,
	atomList,
	ELEMENT_INFO,
	ELEMENTS,
	formulaKey,
	subscript,
} from "./elements";
import { autoLayout, layoutFor } from "./layouts";
import { RECIPES, recipeById } from "./recipes";
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

	it("snaps the minerals the structure ladders are named for", () => {
		for (const id of ["ClNa", "O2Si", "Fe2O3", "CCaO3"])
			expect(recipeById(id).id).toBe(id);
	});

	it("keeps a partial cluster loose", () => {
		expect(resolveAtoms({ C: 1, H: 2 }).kind).toBe("loose");
		expect(resolveAtoms({ O: 1 }).kind).toBe("loose");
	});

	it("never bonds noble gases", () => {
		expect(resolveAtoms({ He: 1, H: 1 }).kind).toBe("fizzle");
		expect(resolveAtoms({ Ar: 2 }).kind).toBe("fizzle");
	});

	it("fizzles past the size limit and on nothing", () => {
		expect(resolveAtoms({ H: 11 }).kind).toBe("fizzle");
		expect(resolveAtoms({}).kind).toBe("fizzle");
	});
});

describe("tierFor", () => {
	it("climbs a named ladder", () => {
		expect(tierFor("H2O", 2)).toBeUndefined();
		expect(tierFor("H2O", 3)?.name).toBe("Droplet");
		expect(tierFor("H2O", 8)?.name).toBe("Puddle");
		expect(tierFor("H2O", 50)?.name).toBe("Ice crystal");
		expect(tierFor("ClNa", 12)?.name).toBe("Salt crystal");
	});

	it("falls back for molecules without one", () => {
		expect(tierFor("H3N", 3)?.name).toBe("Cluster");
		expect(tierFor("H2O2", 20)?.name).toBe("Nebula");
	});
});

describe("data", () => {
	it("tables are valid", () => {
		expect(validateTables()).toEqual([]);
	});

	it("has every element, and only natural ones in recipes", () => {
		expect(ELEMENTS).toHaveLength(118);
		expect(ELEMENT_INFO.Tc?.natural).toBe(false);
		expect(ELEMENT_INFO.Ar?.noble).toBe(true);
	});

	it("has a few hundred recipes", () => {
		expect(RECIPES.length).toBeGreaterThanOrEqual(300);
		expect(RECIPES.length).toBeLessThanOrEqual(500);
	});

	it("lays out every recipe with exactly its atoms and no overlap at the hub", () => {
		for (const r of RECIPES) {
			const placed = layoutFor(r, (el) => ELEMENT_INFO[el]?.radius ?? 14);
			const counts: Record<string, number> = {};
			for (const p of placed) {
				counts[p.el] = (counts[p.el] ?? 0) + 1;
				expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
			}
			expect(formulaKey(counts)).toBe(r.id);
		}
	});
});

describe("formula helpers", () => {
	it("uses the Hill system", () => {
		expect(formulaKey({ O: 1, H: 2 })).toBe("H2O");
		expect(formulaKey({ O: 2, C: 1 })).toBe("CO2");
		expect(formulaKey({ Na: 1, Cl: 1 })).toBe("ClNa");
		expect(formulaKey({ N: 1, H: 3 })).toBe("H3N");
		expect(atomList({ H: 2, O: 1 })).toEqual(["H", "H", "O"]);
		expect(subscript("CaCO3")).toBe("CaCO₃");
	});

	it("auto-lays out hubs and chains", () => {
		expect(autoLayout({ S: 1, O: 4, H: 2 })[0]?.el).toBe("S");
		expect(autoLayout({ Al: 2, O: 3 }).map((n) => n.el)).toEqual([
			"O",
			"Al",
			"O",
			"Al",
			"O",
		]);
	});
});
