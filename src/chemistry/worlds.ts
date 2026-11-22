import worldData from "./data/worlds.json";
import { ELEMENT_INFO, ELEMENTS, type Element } from "./elements";

export interface WorldKind {
	id: string;
	name: string;
	blurb: string;
	/** Atom fractions, summing to 1. */
	abundance: Record<Element, number>;
}

export const WORLDS: readonly WorldKind[] = worldData as WorldKind[];

export function worldKind(id: string): WorldKind {
	const w = WORLDS.find((k) => k.id === id);
	if (!w) throw new Error(`unknown world ${id}`);
	return w;
}

/** How hard real ratios are squashed: 1 is nature, 0 is uniform. */
export const COMPRESSION = 0.3;
/** Share of spawns that are strays from outside the world's own mix. */
export const STRAY_SHARE = 0.02;

export interface SpawnTable {
	elements: Element[];
	/** Cumulative probabilities, last = 1. */
	cumulative: number[];
}

/**
 * Spawn odds for a world: its own abundances, log-compressed, make up 98%;
 * every other naturally occurring element (noble gases included; they just
 * never bond) fills the last 2%
 * by cosmic abundance, so anything natural can turn up eventually.
 */
export function spawnTable(kind: WorldKind): SpawnTable {
	const own = Object.entries(kind.abundance).filter(
		([el, f]) => f > 0 && ELEMENT_INFO[el]?.natural,
	);
	const ownSet = new Set(own.map(([el]) => el));
	const strays = ELEMENTS.filter((el) => {
		const info = ELEMENT_INFO[el];
		return info?.natural && !ownSet.has(el) && (info.cosmic ?? 0) > 0;
	}).map((el) => [el, ELEMENT_INFO[el]?.cosmic ?? 0] as [Element, number]);

	const weigh = (rows: [Element, number][], share: number) => {
		const w = rows.map(
			([el, a]) => [el, a ** COMPRESSION] as [Element, number],
		);
		const total = w.reduce((s, [, x]) => s + x, 0);
		return total > 0
			? w.map(([el, x]) => [el, (x / total) * share] as [Element, number])
			: [];
	};
	const strayShare = strays.length ? STRAY_SHARE : 0;
	const rows = [...weigh(own, 1 - strayShare), ...weigh(strays, strayShare)];

	const elements: Element[] = [];
	const cumulative: number[] = [];
	let acc = 0;
	for (const [el, p] of rows) {
		acc += p;
		elements.push(el);
		cumulative.push(acc);
	}
	if (cumulative.length) cumulative[cumulative.length - 1] = 1;
	return { elements, cumulative };
}

export function pickElement(table: SpawnTable, roll: number): Element {
	let lo = 0;
	let hi = table.cumulative.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (roll < (table.cumulative[mid] ?? 1)) hi = mid;
		else lo = mid + 1;
	}
	return table.elements[lo] ?? "H";
}

/** The probability a table gives one element (for tests and the world card). */
export function chanceOf(table: SpawnTable, el: Element): number {
	const i = table.elements.indexOf(el);
	if (i < 0) return 0;
	return (
		(table.cumulative[i] ?? 0) - (i > 0 ? (table.cumulative[i - 1] ?? 0) : 0)
	);
}
