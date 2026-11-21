/** The atoms that can appear on the canvas. */
export type Element = "H" | "O" | "C" | "N";

export const ELEMENTS: readonly Element[] = ["H", "O", "C", "N"];

export interface ElementInfo {
	symbol: Element;
	name: string;
	/** Fill colour, loosely CPK. */
	color: number;
	/** Rim/glow colour — carbon's fill is dark, so its rim carries it on black. */
	glow: number;
	/** Body radius in world pixels. */
	radius: number;
}

export const ELEMENT_INFO: Record<Element, ElementInfo> = {
	H: {
		symbol: "H",
		name: "Hydrogen",
		color: 0xf2f4f8,
		glow: 0xdfe8ff,
		radius: 14,
	},
	O: {
		symbol: "O",
		name: "Oxygen",
		color: 0xff3b3b,
		glow: 0xff7a6b,
		radius: 20,
	},
	C: {
		symbol: "C",
		name: "Carbon",
		color: 0x3a3d44,
		glow: 0xb8c0cc,
		radius: 21,
	},
	N: {
		symbol: "N",
		name: "Nitrogen",
		color: 0x3f6bff,
		glow: 0x8aa8ff,
		radius: 19,
	},
};

/** A bag of atoms: how many of each element. Missing keys mean zero. */
export type Counts = Partial<Record<Element, number>>;

export function addCounts(a: Counts, b: Counts): Counts {
	const out: Counts = { ...a };
	for (const el of ELEMENTS) {
		const n = (a[el] ?? 0) + (b[el] ?? 0);
		if (n > 0) out[el] = n;
	}
	return out;
}

export function totalAtoms(c: Counts): number {
	let n = 0;
	for (const el of ELEMENTS) n += c[el] ?? 0;
	return n;
}

/** The atoms in a bag as a flat list, in element order. */
export function atomList(c: Counts): Element[] {
	const out: Element[] = [];
	for (const el of ELEMENTS)
		for (let i = 0; i < (c[el] ?? 0); i++) out.push(el);
	return out;
}

/** "H2O"-style key: elements in Hill-ish order (C, H, then the rest). */
export function formulaKey(c: Counts): string {
	const order: Element[] = ["C", "H", "N", "O"];
	return order
		.filter((el) => (c[el] ?? 0) > 0)
		.map((el) => (c[el] === 1 ? el : `${el}${c[el]}`))
		.join("");
}
