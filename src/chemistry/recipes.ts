import type { Counts } from "./elements";

export interface Recipe {
	id: string;
	name: string;
	/** Display formula with subscripts. */
	label: string;
	formula: Counts;
	/** Molecule glow colour. */
	color: number;
}

/** Every molecule the sandbox knows. Add a row to add a molecule. */
export const RECIPES: readonly Recipe[] = [
	{
		id: "H2",
		name: "Hydrogen gas",
		label: "H₂",
		formula: { H: 2 },
		color: 0xdfe8ff,
	},
	{ id: "O2", name: "Oxygen", label: "O₂", formula: { O: 2 }, color: 0xff7a6b },
	{
		id: "N2",
		name: "Nitrogen gas",
		label: "N₂",
		formula: { N: 2 },
		color: 0x8aa8ff,
	},
	{
		id: "H2O",
		name: "Water",
		label: "H₂O",
		formula: { H: 2, O: 1 },
		color: 0x4fc3ff,
	},
	{
		id: "CO2",
		name: "Carbon dioxide",
		label: "CO₂",
		formula: { C: 1, O: 2 },
		color: 0xc9d3e0,
	},
	{
		id: "CH4",
		name: "Methane",
		label: "CH₄",
		formula: { C: 1, H: 4 },
		color: 0x9dffb0,
	},
	{
		id: "NH3",
		name: "Ammonia",
		label: "NH₃",
		formula: { N: 1, H: 3 },
		color: 0xc49dff,
	},
	{ id: "O3", name: "Ozone", label: "O₃", formula: { O: 3 }, color: 0x7affea },
	{
		id: "H2O2",
		name: "Hydrogen peroxide",
		label: "H₂O₂",
		formula: { H: 2, O: 2 },
		color: 0xfff27a,
	},
];

const byId = new Map(RECIPES.map((r) => [r.id, r]));

export function recipeById(id: string): Recipe {
	const r = byId.get(id);
	if (!r) throw new Error(`unknown recipe ${id}`);
	return r;
}
