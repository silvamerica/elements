import { type Counts, ELEMENT_INFO, formulaKey, totalAtoms } from "./elements";
import { RECIPES, type Recipe } from "./recipes";
import { STRUCTURES, type Tier, tiersFor } from "./structures";

export type Resolution =
	| { kind: "snap"; recipe: Recipe }
	| { kind: "loose" }
	| { kind: "fizzle" };

/** Bigger than any recipe; keeps a molecule from being built past sense. */
export const MAX_ATOMS = 10;

const byFormula = new Map(RECIPES.map((r) => [r.id, r]));

function isSubset(c: Counts, of: Counts): boolean {
	for (const [el, n] of Object.entries(c))
		if ((n ?? 0) > (of[el] ?? 0)) return false;
	return true;
}

/**
 * What a bag of atoms becomes: a molecule if it matches a recipe exactly,
 * a loose cluster if it could still grow into one, otherwise nothing.
 * Noble gases never bond.
 */
export function resolveAtoms(c: Counts): Resolution {
	const n = totalAtoms(c);
	if (n === 0) return { kind: "fizzle" };
	for (const el of Object.keys(c))
		if (ELEMENT_INFO[el]?.noble) return { kind: "fizzle" };
	const exact = byFormula.get(formulaKey(c));
	if (exact) return { kind: "snap", recipe: exact };
	if (n < MAX_ATOMS && RECIPES.some((r) => isSubset(c, r.formula)))
		return { kind: "loose" };
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
	for (const r of RECIPES) {
		if (ids.has(r.id)) problems.push(`duplicate formula ${r.id} (${r.name})`);
		ids.add(r.id);
		if (!r.name.trim()) problems.push(`${r.id}: no name`);
		for (const [el, n] of Object.entries(r.formula)) {
			const info = ELEMENT_INFO[el];
			if (!info) problems.push(`${r.id}: unknown element ${el}`);
			else if (info.noble) problems.push(`${r.id}: noble gas ${el}`);
			else if (!info.natural) problems.push(`${r.id}: ${el} never spawns`);
			if (!Number.isInteger(n) || (n ?? 0) < 1)
				problems.push(`${r.id}: bad count for ${el}`);
		}
		const total = totalAtoms(r.formula);
		if (total < 2 || total > MAX_ATOMS)
			problems.push(`${r.id}: ${total} atoms`);
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
