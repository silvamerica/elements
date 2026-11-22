import { describe, expect, it } from "vitest";
import { candidatesFor, missingList, nextTier } from "./candidates";

describe("candidatesFor", () => {
	it("lists what a bag can grow into, nearest first", () => {
		const list = candidatesFor({ H: 2 }, new Set());
		expect(list[0]?.missingTotal).toBe(1);
		expect(list.find((c) => c.recipe.id === "H2O")?.missing).toEqual({ O: 1 });
		expect(list.some((c) => c.recipe.id === "H2")).toBe(false); // already that
		for (let i = 1; i < list.length; i++)
			expect(list[i]?.missingTotal).toBeGreaterThanOrEqual(
				list[i - 1]?.missingTotal ?? 0,
			);
	});

	it("puts known molecules ahead of unknown ones at the same distance", () => {
		const unknown = candidatesFor({ O: 1 }, new Set());
		const known = candidatesFor({ O: 1 }, new Set(["O2"]));
		const firstOf = (l: typeof unknown) =>
			l.filter((c) => c.missingTotal === 1)[0];
		expect(firstOf(known)?.recipe.id).toBe("O2");
		expect(firstOf(known)?.known).toBe(true);
		expect(unknown.every((c) => !c.known)).toBe(true);
	});

	it("never offers anything for a noble gas or an impossible bag", () => {
		expect(candidatesFor({ Ar: 1 }, new Set())).toEqual([]);
		expect(candidatesFor({ H: 11 }, new Set())).toEqual([]);
	});

	it("only offers recipes that contain the whole bag", () => {
		for (const c of candidatesFor({ C: 1, O: 1 }, new Set()))
			expect(
				(c.recipe.formula.C ?? 0) >= 1 && (c.recipe.formula.O ?? 0) >= 1,
			).toBe(true);
	});
});

describe("nextTier", () => {
	it("says how far the next structure tier is", () => {
		expect(nextTier("H2O", 1)).toEqual({ name: "Droplet", more: 2 });
		expect(nextTier("H2O", 3)).toEqual({ name: "Puddle", more: 5 });
		expect(nextTier("H2O", 25)).toBeUndefined();
		expect(nextTier("H3N", 2)).toEqual({ name: "Cluster", more: 1 });
	});
});

describe("missingList", () => {
	it("orders carbon first, then alphabetically", () => {
		expect(missingList({ O: 2, C: 1, H: 3 })).toEqual([
			["C", 1],
			["H", 3],
			["O", 2],
		]);
	});
});
