import { addCounts, type Counts, ELEMENT_INFO } from "./elements";
import { findRecipe } from "./recipes";

/**
 * A species is what takes part in a reaction: a molecule (its recipe id, the
 * Hill formula) or a lone atom (its element symbol). Recipe ids always have
 * two or more atoms, so the two never collide.
 */
export type Species = string;

export type Effect = "burn" | "bang" | "fizz" | "flash" | "smoke" | "glow";

export interface Reaction {
	id: string;
	name: string;
	reactants: Record<Species, number>;
	products: Record<Species, number>;
	/** Won't go without a spark: a flung drop, or a nearby hot reaction. */
	needsHeat?: boolean;
	/** Only a flung drop sets it off (lightning, not fire): nearby heat won't. */
	sparkOnly?: boolean;
	/** Leaves a heat zone that can set off reactions around it. */
	hot?: boolean;
	/** Must be nearby, and is left untouched. */
	catalyst?: Species;
	effect: Effect;
}

/** Real reactions, balanced; a test checks atoms in = atoms out. */
export const REACTIONS: readonly Reaction[] = [
	// Burning
	{
		id: "methane-burns",
		name: "Methane burns",
		reactants: { CH4: 1, O2: 2 },
		products: { CO2: 1, H2O: 2 },
		needsHeat: true,
		hot: true,
		effect: "burn",
	},
	{
		id: "hydrogen-burns",
		name: "Hydrogen explodes",
		reactants: { H2: 2, O2: 1 },
		products: { H2O: 2 },
		needsHeat: true,
		hot: true,
		effect: "bang",
	},
	{
		id: "carbon-burns",
		name: "Carbon burns",
		reactants: { C: 1, O2: 1 },
		products: { CO2: 1 },
		needsHeat: true,
		hot: true,
		effect: "burn",
	},
	{
		id: "co-burns",
		name: "Carbon monoxide burns",
		reactants: { CO: 2, O2: 1 },
		products: { CO2: 2 },
		needsHeat: true,
		hot: true,
		effect: "burn",
	},
	{
		id: "ethanol-burns",
		name: "Ethanol burns",
		reactants: { C2H6O: 1, O2: 3 },
		products: { CO2: 2, H2O: 3 },
		needsHeat: true,
		hot: true,
		effect: "burn",
	},
	{
		id: "sulfur-burns",
		name: "Sulfur burns blue",
		reactants: { S: 1, O2: 1 },
		products: { O2S: 1 },
		needsHeat: true,
		hot: true,
		effect: "burn",
	},
	{
		id: "h2s-burns",
		name: "Hydrogen sulfide burns",
		reactants: { H2S: 2, O2: 3 },
		products: { O2S: 2, H2O: 2 },
		needsHeat: true,
		hot: true,
		effect: "burn",
	},
	{
		id: "magnesium-burns",
		name: "Magnesium burns white",
		reactants: { Mg: 2, O2: 1 },
		products: { MgO: 2 },
		needsHeat: true,
		hot: true,
		effect: "flash",
	},
	{
		id: "silane-burns",
		name: "Silane catches fire in air",
		reactants: { H4Si: 1, O2: 2 },
		products: { O2Si: 1, H2O: 2 },
		hot: true,
		effect: "burn",
	},
	{
		id: "water-gas",
		name: "Steam over hot carbon",
		reactants: { C: 1, H2O: 1 },
		products: { CO: 1, H2: 1 },
		needsHeat: true,
		effect: "glow",
	},
	// Metals in water
	{
		id: "sodium-water",
		name: "Sodium fizzes in water",
		reactants: { Na: 2, H2O: 2 },
		products: { HNaO: 2, H2: 1 },
		hot: true,
		effect: "fizz",
	},
	{
		id: "potassium-water",
		name: "Potassium bursts into violet flame",
		reactants: { K: 2, H2O: 2 },
		products: { HKO: 2, H2: 1 },
		hot: true,
		effect: "bang",
	},
	{
		id: "lithium-water",
		name: "Lithium fizzes in water",
		reactants: { Li: 2, H2O: 2 },
		products: { HLiO: 2, H2: 1 },
		effect: "fizz",
	},
	{
		id: "calcium-water",
		name: "Calcium fizzes in water",
		reactants: { Ca: 1, H2O: 2 },
		products: { CaH2O2: 1, H2: 1 },
		effect: "fizz",
	},
	{
		id: "slaking-lime",
		name: "Quicklime slakes, hot",
		reactants: { CaO: 1, H2O: 1 },
		products: { CaH2O2: 1 },
		hot: true,
		effect: "glow",
	},
	// Acids, bases, salts
	{
		id: "neutralise-naoh",
		name: "Acid meets base: salt water",
		reactants: { ClH: 1, HNaO: 1 },
		products: { ClNa: 1, H2O: 1 },
		effect: "glow",
	},
	{
		id: "ammonium-chloride",
		name: "A puff of ammonium chloride",
		reactants: { ClH: 1, H3N: 1 },
		products: { ClH4N: 1 },
		effect: "smoke",
	},
	{
		id: "limestone-acid",
		name: "Limestone fizzes in acid",
		reactants: { CCaO3: 1, ClH: 2 },
		products: { CaCl2: 1, H2O: 1, CO2: 1 },
		effect: "fizz",
	},
	{
		id: "baking-soda-vinegar",
		name: "Baking soda and vinegar",
		reactants: { CHNaO3: 1, C2H4O2: 1 },
		products: { C2H3NaO2: 1, H2O: 1, CO2: 1 },
		effect: "fizz",
	},
	{
		id: "zinc-acid",
		name: "Zinc dissolves in acid",
		reactants: { Zn: 1, ClH: 2 },
		products: { Cl2Zn: 1, H2: 1 },
		effect: "fizz",
	},
	{
		id: "magnesium-acid",
		name: "Magnesium dissolves in acid",
		reactants: { Mg: 1, ClH: 2 },
		products: { Cl2Mg: 1, H2: 1 },
		effect: "fizz",
	},
	{
		id: "iron-acid",
		name: "Iron dissolves in acid",
		reactants: { Fe: 1, ClH: 2 },
		products: { Cl2Fe: 1, H2: 1 },
		effect: "fizz",
	},
	{
		id: "fertiliser",
		name: "Ammonia meets nitric acid",
		reactants: { H3N: 1, HNO3: 1 },
		products: { H4N2O3: 1 },
		effect: "smoke",
	},
	{
		id: "carbonic-acid",
		name: "Fizzy water",
		reactants: { CO2: 1, H2O: 1 },
		products: { CH2O3: 1 },
		effect: "fizz",
	},
	{
		id: "acid-rain",
		name: "Acid rain",
		reactants: { O3S: 1, H2O: 1 },
		products: { H2O4S: 1 },
		hot: true,
		effect: "glow",
	},
	// Halogens
	{
		id: "salt-from-elements",
		name: "Sodium burns in chlorine",
		reactants: { Na: 2, Cl2: 1 },
		products: { ClNa: 2 },
		hot: true,
		effect: "flash",
	},
	{
		id: "hydrogen-chlorine",
		name: "Hydrogen and chlorine explode",
		reactants: { H2: 1, Cl2: 1 },
		products: { ClH: 2 },
		needsHeat: true,
		hot: true,
		effect: "bang",
	},
	{
		id: "hydrogen-fluorine",
		name: "Hydrogen and fluorine explode",
		reactants: { H2: 1, F2: 1 },
		products: { FH: 2 },
		hot: true,
		effect: "bang",
	},
	// Air
	{
		id: "nitric-oxide-oxidises",
		name: "Brown nitrogen dioxide",
		reactants: { NO: 2, O2: 1 },
		products: { NO2: 2 },
		effect: "smoke",
	},
	{
		id: "ozone-eats-no",
		name: "Ozone meets nitric oxide",
		reactants: { NO: 1, O3: 1 },
		products: { NO2: 1, O2: 1 },
		effect: "glow",
	},
	{
		id: "lightning-ozone",
		name: "Lightning makes ozone",
		reactants: { O2: 3 },
		products: { O3: 2 },
		needsHeat: true,
		sparkOnly: true,
		effect: "flash",
	},
	{
		id: "lightning-no",
		name: "Lightning fixes nitrogen",
		reactants: { N2: 1, O2: 1 },
		products: { NO: 2 },
		needsHeat: true,
		sparkOnly: true,
		effect: "flash",
	},
	{
		id: "haber",
		name: "Ammonia from the air",
		reactants: { N2: 1, H2: 3 },
		products: { H3N: 2 },
		needsHeat: true,
		catalyst: "Fe",
		effect: "glow",
	},
	// Big and hot
	{
		id: "thermite",
		name: "Thermite",
		reactants: { Fe2O3: 1, Al: 2 },
		products: { Al2O3: 1, Fe: 2 },
		needsHeat: true,
		hot: true,
		effect: "flash",
	},
	{
		id: "lime-kiln",
		name: "Limestone roasts to quicklime",
		reactants: { CCaO3: 1 },
		products: { CaO: 1, CO2: 1 },
		needsHeat: true,
		effect: "glow",
	},
	// Catalysed
	{
		id: "peroxide-breaks",
		name: "Peroxide foams over manganese dioxide",
		reactants: { H2O2: 2 },
		products: { H2O: 2, O2: 1 },
		catalyst: "MnO2",
		effect: "fizz",
	},
	{
		id: "contact-process",
		name: "Sulfur dioxide to trioxide",
		reactants: { O2S: 2, O2: 1 },
		products: { O3S: 2 },
		needsHeat: true,
		catalyst: "O5V2",
		effect: "glow",
	},
];

export function speciesLabel(s: Species): string {
	const r = findRecipe(s);
	return r ? r.label : s;
}

/** The atoms in a bag of species. */
export function speciesAtoms(bag: Record<Species, number>): Counts {
	let out: Counts = {};
	for (const [s, n] of Object.entries(bag)) {
		const r = findRecipe(s);
		const atoms: Counts = r ? r.formula : { [s]: 1 };
		for (let i = 0; i < n; i++) out = addCounts(out, atoms);
	}
	return out;
}

/** "CH₄ + 2 O₂ → CO₂ + 2 H₂O" */
export function equation(r: Reaction): string {
	const side = (bag: Record<Species, number>) =>
		Object.entries(bag)
			.map(([s, n]) => `${n > 1 ? `${n} ` : ""}${speciesLabel(s)}`)
			.join(" + ");
	return `${side(r.reactants)} → ${side(r.products)}`;
}

/** Problems in the table; empty when sound. */
export function validateReactions(): string[] {
	const problems: string[] = [];
	const known = (s: Species) => !!findRecipe(s) || !!ELEMENT_INFO[s];
	const ids = new Set<string>();
	for (const r of REACTIONS) {
		if (ids.has(r.id)) problems.push(`duplicate reaction ${r.id}`);
		ids.add(r.id);
		for (const s of [
			...Object.keys(r.reactants),
			...Object.keys(r.products),
			...(r.catalyst ? [r.catalyst] : []),
		])
			if (!known(s)) problems.push(`${r.id}: unknown species ${s}`);
		const a = speciesAtoms(r.reactants);
		const b = speciesAtoms(r.products);
		for (const el of new Set([...Object.keys(a), ...Object.keys(b)]))
			if ((a[el] ?? 0) !== (b[el] ?? 0))
				problems.push(`${r.id}: ${el} ${a[el] ?? 0} in, ${b[el] ?? 0} out`);
	}
	return problems;
}
