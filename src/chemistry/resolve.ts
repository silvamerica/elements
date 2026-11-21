import {
	type Counts,
	ELEMENT_INFO,
	ELEMENTS,
	type Element,
	formulaKey,
	totalAtoms,
} from "./elements";
import { RECIPES, type Recipe } from "./recipes";
import { STRUCTURES, type Tier, tiersFor } from "./structures";

export type Resolution =
	| { kind: "snap"; recipe: Recipe }
	| { kind: "loose" }
	| { kind: "fizzle" };

const byFormula = new Map(RECIPES.map((r) => [formulaKey(r.formula), r]));

function isSubset(c: Counts, of: Counts): boolean {
	return ELEMENTS.every((el) => (c[el] ?? 0) <= (of[el] ?? 0));
}

/**
 * What a bag of atoms becomes: a molecule if it matches a recipe exactly,
 * a loose cluster if it could still grow into one, otherwise nothing.
 */
export function resolveAtoms(c: Counts): Resolution {
	if (totalAtoms(c) === 0) return { kind: "fizzle" };
	const exact = byFormula.get(formulaKey(c));
	if (exact) return { kind: "snap", recipe: exact };
	if (RECIPES.some((r) => isSubset(c, r.formula))) return { kind: "loose" };
	return { kind: "fizzle" };
}

/** The highest tier a structure of `count` molecules has reached, if any. */
export function tierFor(moleculeId: string, count: number): Tier | undefined {
	let reached: Tier | undefined;
	for (const t of tiersFor(moleculeId)) if (count >= t.count) reached = t;
	return reached;
}

/** Problems in the recipe/structure tables; empty when they're sound. */
export function validateTables(): string[] {
	const problems: string[] = [];
	const ids = new Set<string>();
	const formulas = new Set<string>();
	for (const r of RECIPES) {
		if (ids.has(r.id)) problems.push(`duplicate recipe id ${r.id}`);
		ids.add(r.id);
		const key = formulaKey(r.formula);
		if (formulas.has(key)) problems.push(`duplicate formula ${key} (${r.id})`);
		formulas.add(key);
		for (const el of Object.keys(r.formula)) {
			if (!(el in ELEMENT_INFO))
				problems.push(`${r.id}: unknown element ${el}`);
			else if ((r.formula[el as Element] ?? 0) < 1)
				problems.push(`${r.id}: bad count for ${el}`);
		}
		if (totalAtoms(r.formula) < 2)
			problems.push(`${r.id}: a molecule needs at least 2 atoms`);
	}
	for (const [id, tiers] of Object.entries(STRUCTURES)) {
		if (!ids.has(id)) problems.push(`structures for unknown molecule ${id}`);
		if (tiers.length === 0) problems.push(`${id}: empty tier ladder`);
		for (let i = 0; i < tiers.length; i++) {
			const t = tiers[i] as Tier;
			if (t.count < 2)
				problems.push(`${id}: tier ${t.name} needs at least 2 molecules`);
			const prev = tiers[i - 1];
			if (prev && t.count <= prev.count)
				problems.push(`${id}: tiers must increase (${t.name})`);
		}
	}
	return problems;
}
