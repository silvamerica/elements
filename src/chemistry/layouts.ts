import type { Element } from "./elements";
import type { Recipe } from "./recipes";

/**
 * A molecule's 2D shape as a tree: node 0 sits at the origin, each later node
 * hangs off an earlier one at an angle (degrees, y-down). Bond length comes
 * from the two atoms' radii, so shapes stay right if radii change.
 */
export type LayoutNode = { el: Element; from?: number; angle?: number };

/** Hand shapes for the originals, keyed by Hill formula. */
const LAYOUTS: Record<string, LayoutNode[]> = {
	H2: [{ el: "H" }, { el: "H", from: 0, angle: 0 }],
	O2: [{ el: "O" }, { el: "O", from: 0, angle: 0 }],
	N2: [{ el: "N" }, { el: "N", from: 0, angle: 0 }],
	H2O: [
		{ el: "O" },
		{ el: "H", from: 0, angle: 142 },
		{ el: "H", from: 0, angle: 38 },
	],
	CO2: [
		{ el: "C" },
		{ el: "O", from: 0, angle: 0 },
		{ el: "O", from: 0, angle: 180 },
	],
	CH4: [
		{ el: "C" },
		{ el: "H", from: 0, angle: 45 },
		{ el: "H", from: 0, angle: 135 },
		{ el: "H", from: 0, angle: 225 },
		{ el: "H", from: 0, angle: 315 },
	],
	H3N: [
		{ el: "N" },
		{ el: "H", from: 0, angle: 90 },
		{ el: "H", from: 0, angle: 210 },
		{ el: "H", from: 0, angle: 330 },
	],
	O3: [
		{ el: "O" },
		{ el: "O", from: 0, angle: 150 },
		{ el: "O", from: 0, angle: 30 },
	],
	H2O2: [
		{ el: "O" },
		{ el: "O", from: 0, angle: 0 },
		{ el: "H", from: 0, angle: 125 },
		{ el: "H", from: 1, angle: -55 },
	],
};

/** Centre-to-centre distance as a fraction of the two radii summed. */
export const BOND_FACTOR = 0.78;

export interface PlacedAtom {
	el: Element;
	x: number;
	y: number;
}

/** Atom positions relative to the molecule's first atom. */
export function layoutFor(
	recipe: Recipe,
	radius: (el: Element) => number,
): PlacedAtom[] {
	const nodes = LAYOUTS[recipe.id] ?? autoLayout(recipe.formula);
	const placed: PlacedAtom[] = [];
	for (const n of nodes) {
		const parent = n.from === undefined ? undefined : placed[n.from];
		if (!parent) {
			placed.push({ el: n.el, x: 0, y: 0 });
			continue;
		}
		const d = (radius(parent.el) + radius(n.el)) * BOND_FACTOR;
		const a = ((n.angle ?? 0) * Math.PI) / 180;
		placed.push({
			el: n.el,
			x: parent.x + Math.cos(a) * d,
			y: parent.y + Math.sin(a) * d,
		});
	}
	return placed;
}

/**
 * A plausible shape from counts alone. A single atom of the scarcest heavy
 * element becomes the hub with everything around it (CO2, SiO2, H2SO4);
 * otherwise the heavy atoms make a zigzag chain, alternating elements
 * (Al2O3, C2H6), and hydrogens hang off the chain round-robin.
 */
export function autoLayout(
	counts: Partial<Record<Element, number>>,
): LayoutNode[] {
	const heavy: [Element, number][] = Object.entries(counts)
		.filter(([el, n]) => el !== "H" && (n ?? 0) > 0)
		.map(([el, n]) => [el, n ?? 0]);
	const hydrogens = counts.H ?? 0;

	if (heavy.length === 0) {
		// Pure hydrogen beyond H2 isn't a recipe, but stay total.
		return Array.from({ length: hydrogens }, (_, i) =>
			i === 0
				? { el: "H" }
				: {
						el: "H",
						from: 0,
						angle: (360 / Math.max(1, hydrogens - 1)) * (i - 1),
					},
		);
	}

	heavy.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
	const [hubEl, hubCount] = heavy[0] as [Element, number];

	if (hubCount === 1) {
		const ligands: Element[] = [];
		for (const [el, n] of heavy.slice(1))
			for (let i = 0; i < n; i++) ligands.push(el);
		for (let i = 0; i < hydrogens; i++) ligands.push("H");
		const nodes: LayoutNode[] = [{ el: hubEl }];
		// Heavy ligands evenly around the hub; when hydrogens outnumber the
		// spare slots, hang them off heavy ligands instead (H2SO4's OH groups).
		const heavyLigands = ligands.filter((el) => el !== "H");
		const ring = Math.max(heavyLigands.length, Math.min(ligands.length, 6));
		heavyLigands.forEach((el, i) => {
			nodes.push({ el, from: 0, angle: (360 / ring) * i + 90 });
		});
		let slot = heavyLigands.length;
		let onLigand = 0;
		for (let h = 0; h < hydrogens; h++) {
			if (slot < ring) {
				nodes.push({ el: "H", from: 0, angle: (360 / ring) * slot + 90 });
				slot++;
			} else {
				const parent = 1 + (onLigand % Math.max(1, heavyLigands.length));
				const parentAngle = (360 / ring) * (parent - 1) + 90;
				nodes.push({
					el: "H",
					from: heavyLigands.length ? parent : 0,
					angle: parentAngle + 35,
				});
				onLigand++;
			}
		}
		return nodes;
	}

	// Chain: interleave elements so minority atoms sit between majority ones.
	const pool = heavy.map(([el, n]) => ({ el, left: n }));
	const chain: Element[] = [];
	let last: Element | undefined;
	while (pool.some((p) => p.left > 0)) {
		const pick =
			pool
				.filter((p) => p.left > 0 && p.el !== last)
				.sort((a, b) => b.left - a.left)[0] ?? pool.find((p) => p.left > 0);
		if (!pick) break;
		chain.push(pick.el);
		pick.left--;
		last = pick.el;
	}
	const nodes: LayoutNode[] = chain.map((el, i) =>
		i === 0 ? { el } : { el, from: i - 1, angle: i % 2 ? 30 : -30 },
	);
	for (let h = 0; h < hydrogens; h++) {
		const on = h % chain.length;
		const round = Math.floor(h / chain.length);
		const up = on % 2 ? -1 : 1;
		const angle = 90 * up + (round % 2 ? 50 : -50) * (round > 1 ? -1 : 1);
		nodes.push({ el: "H", from: on, angle });
	}
	return nodes;
}

export function hasLayout(id: string): boolean {
	return id in LAYOUTS;
}
