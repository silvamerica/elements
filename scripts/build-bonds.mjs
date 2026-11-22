#!/usr/bin/env node
// Builds src/chemistry/data/bonds.json: the 2D bond graph (atoms plus
// bonds with bond order) of every recipe in recipes.json, taken from
// PubChem's 2D compound records.
//
//   node scripts/build-bonds.mjs               # fetch (cached), write bonds.json
//   node scripts/build-bonds.mjs --cache DIR   # cache PubChem responses in DIR
//
// For each recipe the script looks up CIDs by name (plus a few spelling
// variants), then by exact molecular formula, and keeps the first CID whose
// 2D record has atom counts exactly equal to the recipe's counts. Charges
// are ignored, so ionic records ([Na+].[Cl-]) match and are kept as
// disconnected components. Recipes with no exact match are left out and
// listed on stderr.
//
// Bond orders are PubChem's own codes, copied as is: 1 single, 2 double,
// 3 triple, 4 quadruple, 5 dative, 6 complex, 7 ionic. PubChem's 2D records
// store aromatic rings in Kekulé form, so aromaticity shows up as 1/2.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECIPES = join(ROOT, "src/chemistry/data/recipes.json");
const OUT = join(ROOT, "src/chemistry/data/bonds.json");
const UA = "water-sandbox-bond-builder/1.0";
const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const DELAY_MS = 250; // stays under PubChem's 5 requests/second
const MAX_NAME_CIDS = 10;
const MAX_FORMULA_CIDS = 25;

const args = process.argv.slice(2);
const cacheIdx = args.indexOf("--cache");
const CACHE =
	cacheIdx >= 0 ? args[cacheIdx + 1] : join(tmpdir(), "water-bonds-cache");
mkdirSync(CACHE, { recursive: true });

// Symbols by atomic number, Z = 1..118.
const SYMBOLS = `H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr
Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn
Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir
Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr
Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og`.split(/\s+/);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);

/** GET a PubChem URL as JSON, cached on disk; null on 404 (also cached). */
async function pug(cacheName, url) {
	const path = join(CACHE, `${safe(cacheName)}.json`);
	if (existsSync(path)) {
		const text = readFileSync(path, "utf8");
		return text === "404" ? null : JSON.parse(text);
	}
	for (let attempt = 0; ; attempt++) {
		await sleep(DELAY_MS);
		const res = await fetch(url, { headers: { "User-Agent": UA } });
		if (res.ok) {
			const text = await res.text();
			writeFileSync(path, text);
			return JSON.parse(text);
		}
		if (res.status === 404 || res.status === 400) {
			writeFileSync(path, "404");
			return null;
		}
		if ((res.status === 503 || res.status === 429 || res.status >= 500) && attempt < 6) {
			await sleep(1000 * 2 ** attempt);
			continue;
		}
		throw new Error(`${url}: HTTP ${res.status}`);
	}
}

async function cidsByName(name) {
	const json = await pug(
		`name-${name}`,
		`${PUG}/compound/name/${encodeURIComponent(name)}/cids/JSON`,
	);
	return json?.IdentifierList?.CID ?? [];
}

async function cidsByFormula(formula) {
	const json = await pug(
		`formula-${formula}`,
		`${PUG}/compound/fastformula/${encodeURIComponent(formula)}/cids/JSON`,
	);
	return json?.IdentifierList?.CID ?? [];
}

/** { atoms: [symbol], bonds: [[i, j, order]] } from a CID's 2D record. */
async function graph(cid) {
	const json = await pug(
		`cid-${cid}-2d`,
		`${PUG}/compound/cid/${cid}/record/JSON?record_type=2d`,
	);
	const c = json?.PC_Compounds?.[0];
	if (!c?.atoms) return null;
	const index = new Map(c.atoms.aid.map((aid, i) => [aid, i]));
	const atoms = c.atoms.element.map((z) => SYMBOLS[z - 1] ?? `?${z}`);
	const b = c.bonds ?? { aid1: [], aid2: [], order: [] };
	const bonds = b.aid1.map((a1, k) => [index.get(a1), index.get(b.aid2[k]), b.order[k]]);
	return { atoms, bonds };
}

const keyOf = (counts) =>
	Object.keys(counts)
		.sort()
		.map((el) => `${el}:${counts[el]}`)
		.join(",");

function countAtoms(atoms) {
	const counts = {};
	for (const a of atoms) counts[a] = (counts[a] || 0) + 1;
	return counts;
}

/** Name spellings to try, most specific first. */
function nameVariants(name) {
	const out = [name];
	const add = (s) => {
		if (s && !out.includes(s)) out.push(s);
	};
	add(name.replace(/\s+gas$/i, ""));
	for (const n of [...out]) {
		add(n.replace(/aluminium/gi, "aluminum").replace(/caesium/gi, "cesium"));
	}
	return out;
}

/** Formula in Hill order, as PubChem's fastformula expects. */
function hill(counts) {
	const els = Object.keys(counts);
	const fmt = (el) => `${el}${counts[el] > 1 ? counts[el] : ""}`;
	if (els.includes("C")) {
		const rest = els.filter((e) => e !== "C" && e !== "H").sort();
		return ["C", ...(els.includes("H") ? ["H"] : []), ...rest].map(fmt).join("");
	}
	return els.sort().map(fmt).join("");
}

async function firstMatch(cids, key, limit) {
	for (const cid of cids.slice(0, limit)) {
		const g = await graph(cid);
		if (g && keyOf(countAtoms(g.atoms)) === key) return { cid, ...g };
	}
	return null;
}

async function main() {
	const recipes = JSON.parse(readFileSync(RECIPES, "utf8"));
	const out = {};
	const missing = [];
	const log = [];
	for (const r of recipes) {
		const key = keyOf(r.counts);
		let hit = null;
		let how = null;
		for (const n of nameVariants(r.name)) {
			const cids = await cidsByName(n);
			hit = await firstMatch(cids, key, MAX_NAME_CIDS);
			if (hit) {
				how = `name "${n}"${cids[0] === hit.cid ? "" : ` (CID ${cids[0]} listed first, did not match)`}`;
				break;
			}
		}
		if (!hit) {
			const cids = [...(await cidsByFormula(hill(r.counts)))].sort((a, b) => a - b);
			hit = await firstMatch(cids, key, MAX_FORMULA_CIDS);
			if (hit) how = `formula ${hill(r.counts)} (lowest matching of ${cids.length} CIDs)`;
		}
		if (!hit) {
			missing.push(`${r.formula}\t${r.name}`);
			console.error(`MISSING ${r.formula} (${r.name})`);
			continue;
		}
		out[r.formula] = { cid: hit.cid, atoms: hit.atoms, bonds: hit.bonds };
		log.push(`${r.formula}\t${r.name}\tCID ${hit.cid}\tvia ${how}`);
	}
	// One entry per line keeps diffs readable without bloating the file.
	const lines = Object.entries(out).map(
		([f, e]) => `\t${JSON.stringify(f)}: ${JSON.stringify(e)}`,
	);
	writeFileSync(OUT, `{\n${lines.join(",\n")}\n}\n`);
	writeFileSync(join(CACHE, "_build-log.tsv"), `${log.join("\n")}\n`);
	writeFileSync(join(CACHE, "_missing.tsv"), `${missing.join("\n")}\n`);
	console.error(
		`wrote ${Object.keys(out).length}/${recipes.length} graphs to ${OUT}; ${missing.length} missing`,
	);
}

await main();
