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
};

export function tiersFor(moleculeId: string): readonly Tier[] {
	return STRUCTURES[moleculeId] ?? FALLBACK_TIERS;
}
