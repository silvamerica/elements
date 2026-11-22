import elementData from "./data/elements.json";

/** An element symbol, e.g. "H" or "Fe". */
export type Element = string;

interface ElementRow {
	z: number;
	symbol: string;
	name: string;
	color: string;
	radiusPm: number;
	natural: boolean;
	noble: boolean;
	cosmic: number | null;
}

export interface ElementInfo {
	z: number;
	symbol: Element;
	name: string;
	/** Fill colour (Jmol CPK). */
	color: number;
	/** Rim/glow colour: the fill, lifted so dark elements still read on black. */
	glow: number;
	/** Body radius in world pixels, compressed from the real atomic radius. */
	radius: number;
	/** Occurs in nature, so it can spawn. */
	natural: boolean;
	/** Noble gas: never bonds. */
	noble: boolean;
	/** Solar-system abundance (atoms per 10⁶ Si), for strays. */
	cosmic: number | null;
}

/** Real radii run 25 pm (H) to ~260 pm (Cs); squeeze them into tappable sizes. */
export function displayRadius(pm: number): number {
	return Math.max(12, Math.min(27, 13 + (13 * (pm - 25)) / 235));
}

function lift(color: number): number {
	const ch = (shift: number) => {
		const v = (color >> shift) & 255;
		return Math.round(v + (255 - v) * 0.45);
	};
	return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export const ELEMENT_INFO: Readonly<Record<Element, ElementInfo>> =
	Object.fromEntries(
		(elementData as ElementRow[]).map((row) => {
			const color = Number.parseInt(row.color.slice(1), 16);
			return [
				row.symbol,
				{
					z: row.z,
					symbol: row.symbol,
					name: row.name,
					color,
					glow: lift(color),
					radius: displayRadius(row.radiusPm),
					natural: row.natural,
					noble: row.noble,
					cosmic: row.cosmic,
				},
			];
		}),
	);

/** Every symbol, in atomic-number order. */
export const ELEMENTS: readonly Element[] = (elementData as ElementRow[]).map(
	(r) => r.symbol,
);

export function elementInfo(el: Element): ElementInfo {
	const info = ELEMENT_INFO[el];
	if (!info) throw new Error(`unknown element ${el}`);
	return info;
}

/** A bag of atoms: how many of each element. Missing keys mean zero. */
export type Counts = Partial<Record<Element, number>>;

export function addCounts(a: Counts, b: Counts): Counts {
	const out: Counts = { ...a };
	for (const [el, n] of Object.entries(b)) out[el] = (out[el] ?? 0) + (n ?? 0);
	return out;
}

export function totalAtoms(c: Counts): number {
	let n = 0;
	for (const v of Object.values(c)) n += v ?? 0;
	return n;
}

/** The atoms in a bag as a flat list, in Hill order. */
export function atomList(c: Counts): Element[] {
	const out: Element[] = [];
	for (const el of hillOrder(c))
		for (let i = 0; i < (c[el] ?? 0); i++) out.push(el);
	return out;
}

/** Hill system: C first, then H, then the rest alphabetically; with no C, all alphabetical. */
function hillOrder(c: Counts): Element[] {
	const present = Object.keys(c)
		.filter((el) => (c[el] ?? 0) > 0)
		.sort();
	if (!present.includes("C")) return present;
	const rest = present.filter((el) => el !== "C" && el !== "H");
	return ["C", ...(present.includes("H") ? ["H"] : []), ...rest];
}

/** The Hill formula, e.g. "H2O", "CH4", "ClNa". Doubles as a recipe id. */
export function formulaKey(c: Counts): string {
	return hillOrder(c)
		.map((el) => (c[el] === 1 ? el : `${el}${c[el]}`))
		.join("");
}

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";

/** "CaCO3" → "CaCO₃". */
export function subscript(formula: string): string {
	return formula.replace(/\d/g, (d) => SUBSCRIPTS[Number(d)] ?? d);
}
