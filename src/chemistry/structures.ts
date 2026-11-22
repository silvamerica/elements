export interface Tier {
	/** Molecules needed to reach this tier. */
	count: number;
	name: string;
}

/** Used for any molecule without a named ladder. */
export const FALLBACK_TIERS: readonly Tier[] = [
	{ count: 3, name: "Cluster" },
	{ count: 8, name: "Mass" },
	{ count: 20, name: "Nebula" },
];

/** Themed ladders, keyed by recipe id. Must be strictly increasing. */
export const STRUCTURES: Readonly<Record<string, readonly Tier[]>> = {
	H2O: [
		{ count: 3, name: "Droplet" },
		{ count: 8, name: "Puddle" },
		{ count: 20, name: "Ice crystal" },
	],
	CO2: [
		{ count: 4, name: "Dry ice" },
		{ count: 10, name: "Frost" },
	],
	CH4: [{ count: 4, name: "Gas pocket" }],
	O2: [{ count: 4, name: "Bubble" }],
	N2: [{ count: 5, name: "Fog" }],
	ClNa: [
		{ count: 4, name: "Salt grain" },
		{ count: 12, name: "Salt crystal" },
	],
	O2Si: [
		{ count: 4, name: "Sand" },
		{ count: 12, name: "Quartz" },
	],
	Fe2O3: [
		{ count: 3, name: "Rust flake" },
		{ count: 10, name: "Rust" },
	],
	CCaO3: [
		{ count: 4, name: "Chalk" },
		{ count: 12, name: "Limestone" },
	],
};

export function tiersFor(moleculeId: string): readonly Tier[] {
	return STRUCTURES[moleculeId] ?? FALLBACK_TIERS;
}
