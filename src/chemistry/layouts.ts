import { atomList, type Element } from "./elements";
import type { Recipe } from "./recipes";

/**
 * A molecule's 2D shape as a tree: node 0 sits at the origin, each later node
 * hangs off an earlier one at an angle (degrees, y-down). Bond length comes
 * from the two atoms' radii, so shapes stay right if radii change.
 */
export type LayoutNode = { el: Element; from?: number; angle?: number };

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
	NH3: [
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
	const nodes = LAYOUTS[recipe.id] ?? ringLayout(recipe);
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

/** For recipes without a hand layout: first atom in the middle, the rest around it. */
function ringLayout(recipe: Recipe): LayoutNode[] {
	const atoms = atomList(recipe.formula);
	const centre = atoms.find((el) => el !== "H") ?? atoms[0] ?? "H";
	const rest = [...atoms];
	rest.splice(rest.indexOf(centre), 1);
	return [
		{ el: centre },
		...rest.map((el, i) => ({ el, from: 0, angle: (360 / rest.length) * i })),
	];
}

export function hasLayout(id: string): boolean {
	return id in LAYOUTS;
}
