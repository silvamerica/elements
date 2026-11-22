import { type Counts, ELEMENT_INFO } from "./elements";
import { RECIPES, type Recipe } from "./recipes";
import { tiersFor } from "./structures";

export interface Candidate {
	recipe: Recipe;
	/** Already made by hand at least once, so its name can be shown. */
	known: boolean;
	/** Atoms still needed, by element. */
	missing: Counts;
	missingTotal: number;
}

/**
 * Every molecule a bag of atoms could still grow into, nearest first
 * (fewest atoms missing, then known before unknown, then by name). An
 * exact match isn't listed: that's what the bag already is.
 */
export function candidatesFor(
	have: Counts,
	known: ReadonlySet<string>,
): Candidate[] {
	for (const el of Object.keys(have)) if (ELEMENT_INFO[el]?.noble) return [];
	const out: Candidate[] = [];
	for (const recipe of RECIPES) {
		const missing: Counts = {};
		let fits = true;
		let missingTotal = 0;
		for (const [el, n] of Object.entries(have))
			if ((n ?? 0) > (recipe.formula[el] ?? 0)) fits = false;
		if (!fits) continue;
		for (const [el, n] of Object.entries(recipe.formula)) {
			const gap = (n ?? 0) - (have[el] ?? 0);
			if (gap > 0) {
				missing[el] = gap;
				missingTotal += gap;
			}
		}
		if (missingTotal === 0) continue;
		out.push({ recipe, known: known.has(recipe.id), missing, missingTotal });
	}
	return out.sort(
		(a, b) =>
			a.missingTotal - b.missingTotal ||
			Number(b.known) - Number(a.known) ||
			a.recipe.name.localeCompare(b.recipe.name),
	);
}

/** The next structure tier for `count` molecules of a recipe, and how many more it takes. */
export function nextTier(
	recipeId: string,
	count: number,
): { name: string; more: number } | undefined {
	const next = tiersFor(recipeId).find((t) => t.count > count);
	return next && { name: next.name, more: next.count - count };
}

/** "+2 O +1 C" style list, in the bag's Hill-ish order. */
export function missingList(missing: Counts): [string, number][] {
	return Object.entries(missing)
		.filter(([, n]) => (n ?? 0) > 0)
		.map(([el, n]) => [el, n ?? 0] as [string, number])
		.sort((a, b) =>
			a[0] === "C" ? -1 : b[0] === "C" ? 1 : a[0].localeCompare(b[0]),
		);
}
