import type { Counts } from "./elements";

/** A molecule's real 2D structure: atoms (element symbols) and bonds [i, j, order]. */
export interface BondGraph {
	atoms: string[];
	bonds: [number, number, number][];
}

/**
 * The smaller book molecules a molecule is built from, by its real
 * structure: cut any one bond, and if that splits it into two pieces where
 * a piece (of two or more atoms) is itself a known molecule, that molecule
 * is a part. O=O–O gives O₂; O=C=O gives CO; H–O–O–H gives nothing (OH
 * isn't a molecule in the book), so it builds from atoms.
 *
 * `idOf` says which recipe a bag of atoms is, if any. Returns recipe ids,
 * without duplicates and never the molecule itself.
 */
export function partsFromGraph(
	graph: BondGraph,
	idOf: (counts: Counts) => string | undefined,
): string[] {
	const n = graph.atoms.length;
	// Ionic compounds (PubChem bond orders 6 "complex" and 7 "ionic", or
	// separate ions with no bond) are held by charge, not built piece by
	// piece: they build from atoms.
	const bonds = graph.bonds.filter(([, , order]) => order <= 5);
	if (componentsCount(n, bonds) !== 1) return [];
	const self = idOf(countAtoms(graph.atoms, range(n)));
	const found = new Set<string>();
	for (let cut = 0; cut < bonds.length; cut++) {
		const pieces = components(
			n,
			bonds.filter((_, i) => i !== cut),
		);
		// A bond inside a ring doesn't split the molecule in two.
		if (pieces.length !== 2) continue;
		for (const piece of pieces) {
			if (piece.length < 2 || piece.length === n) continue;
			const id = idOf(countAtoms(graph.atoms, piece));
			if (id && id !== self) found.add(id);
		}
	}
	return [...found].sort();
}

function range(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i);
}

function countAtoms(atoms: string[], idx: number[]): Counts {
	const c: Counts = {};
	for (const i of idx) {
		const el = atoms[i] as string;
		c[el] = (c[el] ?? 0) + 1;
	}
	return c;
}

/** Connected components as lists of atom indices (union-find). */
function components(n: number, bonds: [number, number, number][]): number[][] {
	const parent = range(n);
	const find = (x: number): number => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x] as number] as number;
			x = parent[x] as number;
		}
		return x;
	};
	for (const [a, b] of bonds) parent[find(a)] = find(b);
	const groups = new Map<number, number[]>();
	for (let i = 0; i < n; i++) {
		const r = find(i);
		groups.set(r, [...(groups.get(r) ?? []), i]);
	}
	return [...groups.values()];
}

function componentsCount(n: number, bonds: [number, number, number][]): number {
	return components(n, bonds).length;
}
