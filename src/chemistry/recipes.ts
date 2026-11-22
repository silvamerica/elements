import recipeData from "./data/recipes.json";
import { type Counts, ELEMENT_INFO, formulaKey, subscript } from "./elements";

export interface Recipe {
	/** Hill formula, unique per atom-count multiset. */
	id: string;
	name: string;
	/** Display formula with subscripts, as conventionally written. */
	label: string;
	formula: Counts;
	/** Molecule glow colour. */
	color: number;
}

interface RecipeRow {
	formula: string;
	name: string;
	counts: Record<string, number>;
}

/** Hand-picked glows for the originals; the rest blend their atoms' colours. */
const COLORS: Record<string, number> = {
	H2: 0xdfe8ff,
	O2: 0xff7a6b,
	N2: 0x8aa8ff,
	H2O: 0x4fc3ff,
	CO2: 0xc9d3e0,
	CH4: 0x9dffb0,
	H3N: 0xc49dff,
	O3: 0x7affea,
	H2O2: 0xfff27a,
};

/** Average the constituent element colours, weighted by count, then brighten. */
export function blendColor(counts: Counts): number {
	let r = 0;
	let g = 0;
	let b = 0;
	let n = 0;
	for (const [el, k] of Object.entries(counts)) {
		const info = ELEMENT_INFO[el];
		if (!info || !k) continue;
		r += ((info.glow >> 16) & 255) * k;
		g += ((info.glow >> 8) & 255) * k;
		b += (info.glow & 255) * k;
		n += k;
	}
	if (n === 0) return 0xffffff;
	const lift = (v: number) => Math.round(v / n + (255 - v / n) * 0.25);
	return (lift(r) << 16) | (lift(g) << 8) | lift(b);
}

/** Every compound the sandbox knows. Generated into data/recipes.json. */
export const RECIPES: readonly Recipe[] = (
	recipeData as unknown as RecipeRow[]
).map((row) => {
	const id = formulaKey(row.counts);
	return {
		id,
		name: row.name,
		label: subscript(row.formula),
		formula: row.counts,
		color: COLORS[id] ?? blendColor(row.counts),
	};
});

const byId = new Map(RECIPES.map((r) => [r.id, r]));

export function recipeById(id: string): Recipe {
	const r = byId.get(id);
	if (!r) throw new Error(`unknown recipe ${id}`);
	return r;
}

export function findRecipe(id: string): Recipe | undefined {
	return byId.get(id);
}
