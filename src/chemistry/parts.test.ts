import { describe, expect, it } from "vitest";
import { type Counts, formulaKey } from "./elements";
import { type BondGraph, partsFromGraph } from "./parts";

// A tiny book for the tests.
const BOOK = new Set([
	"O2",
	"O3",
	"CO",
	"CO2",
	"H2O",
	"H2O2",
	"N2",
	"N2O",
	"CH4",
]);
const idOf = (c: Counts) => {
	const k = formulaKey(c);
	return BOOK.has(k) ? k : undefined;
};

describe("partsFromGraph", () => {
	it("finds O₂ inside ozone", () => {
		const o3: BondGraph = {
			atoms: ["O", "O", "O"],
			bonds: [
				[0, 1, 2],
				[1, 2, 1],
			],
		};
		expect(partsFromGraph(o3, idOf)).toEqual(["O2"]);
	});

	it("finds CO inside carbon dioxide", () => {
		const co2: BondGraph = {
			atoms: ["O", "C", "O"],
			bonds: [
				[0, 1, 2],
				[1, 2, 2],
			],
		};
		expect(partsFromGraph(co2, idOf)).toEqual(["CO"]);
	});

	it("finds N₂ inside nitrous oxide", () => {
		const n2o: BondGraph = {
			atoms: ["N", "N", "O"],
			bonds: [
				[0, 1, 3],
				[1, 2, 1],
			],
		};
		expect(partsFromGraph(n2o, idOf)).toEqual(["N2"]);
	});

	it("finds nothing where no cut leaves a book molecule", () => {
		const h2o2: BondGraph = {
			atoms: ["O", "O", "H", "H"],
			bonds: [
				[0, 1, 1],
				[0, 2, 1],
				[1, 3, 1],
			],
		};
		const ch4: BondGraph = {
			atoms: ["C", "H", "H", "H", "H"],
			bonds: [
				[0, 1, 1],
				[0, 2, 1],
				[0, 3, 1],
				[0, 4, 1],
			],
		};
		expect(partsFromGraph(h2o2, idOf)).toEqual([]);
		expect(partsFromGraph(ch4, idOf)).toEqual([]);
	});

	it("ignores ring bonds and ionic (disconnected) records", () => {
		const ring: BondGraph = {
			atoms: ["O", "O", "O"],
			bonds: [
				[0, 1, 1],
				[1, 2, 1],
				[2, 0, 1],
			],
		};
		expect(partsFromGraph(ring, idOf)).toEqual([]);
		const salt: BondGraph = { atoms: ["Na", "Cl"], bonds: [] };
		expect(partsFromGraph(salt, idOf)).toEqual([]);
		const ionicBond: BondGraph = { atoms: ["Cl", "Na"], bonds: [[0, 1, 7]] };
		expect(partsFromGraph(ionicBond, idOf)).toEqual([]);
	});
});
