#!/usr/bin/env node
// Builds src/chemistry/data/recipes.json from Wikipedia's "Glossary of
// chemical formulae" (formerly "Dictionary of chemical formulas") and
// "List of inorganic compounds", plus a small PubChem-verified supplement
// for entries neither list carries (elemental molecules, a few minerals and
// organics).
//
//   node scripts/build-recipes.mjs            # fetch sources, write recipes.json
//   node scripts/build-recipes.mjs --pool     # print the filtered candidate pool
//   node scripts/build-recipes.mjs --sources  # print each entry with its source row
//   node scripts/build-recipes.mjs --cache DIR  # cache downloads in DIR
//
// Every curated entry below must be found in a source: either a Wikipedia
// row whose formula parses to the same atom counts, or a PubChem record
// (looked up by CID) whose MolecularFormula matches. The build fails
// otherwise, so nothing in the output rests on memory alone.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/chemistry/data/recipes.json");
const UA = "elements-sandbox-recipe-builder/1.0";

const args = process.argv.slice(2);
const cacheIdx = args.indexOf("--cache");
const CACHE =
	cacheIdx >= 0 ? args[cacheIdx + 1] : join(tmpdir(), "elements-recipes-cache");
mkdirSync(CACHE, { recursive: true });

// Symbols Z = 1..92 in order.
const SYMBOLS = `H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr
Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn
Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir
Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U`.split(/\s+/);
const EXCLUDED = new Set(["Tc", "Pm", "He", "Ne", "Ar", "Kr", "Xe", "Rn"]);
const ALLOWED = new Set(SYMBOLS.filter((s) => !EXCLUDED.has(s)));
const KNOWN = new Set(SYMBOLS);

async function cached(name, url) {
	const path = join(CACHE, name);
	if (existsSync(path)) return readFileSync(path, "utf8");
	const res = await fetch(url, { headers: { "User-Agent": UA } });
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	const text = await res.text();
	writeFileSync(path, text);
	return text;
}

async function wikitext(page) {
	const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&redirects=1`;
	const json = JSON.parse(await cached(`${page}.json`, url));
	return json.parse.wikitext["*"];
}

/** Parse a formula into total counts; null if it is not a plain neutral formula. */
export function parseFormula(raw) {
	const f = raw.replace(/\s+/g, "");
	if (!f || /[*·•+\-−–,;:=/]|\.|\b(aq|s|l|g)\b/.test(f)) return null;
	const stack = [{}];
	let i = 0;
	const add = (into, el, n) => {
		into[el] = (into[el] || 0) + n;
	};
	while (i < f.length) {
		const c = f[i];
		if (c === "(" || c === "[" || c === "{") {
			stack.push({});
			i++;
		} else if (c === ")" || c === "]" || c === "}") {
			if (stack.length < 2) return null;
			i++;
			let num = "";
			while (i < f.length && /\d/.test(f[i])) num += f[i++];
			const group = stack.pop();
			const n = num ? Number(num) : 1;
			for (const [el, k] of Object.entries(group))
				add(stack[stack.length - 1], el, k * n);
		} else if (/[A-Z]/.test(c)) {
			let sym = c;
			if (i + 1 < f.length && /[a-z]/.test(f[i + 1])) {
				const two = c + f[i + 1];
				if (KNOWN.has(two)) sym = two;
			}
			if (!KNOWN.has(sym)) return null;
			i += sym.length;
			let num = "";
			while (i < f.length && /\d/.test(f[i])) num += f[i++];
			add(stack[stack.length - 1], sym, num ? Number(num) : 1);
		} else return null;
	}
	if (stack.length !== 1) return null;
	return stack[0];
}

export const keyOf = (counts) =>
	Object.keys(counts)
		.sort()
		.map((el) => `${el}:${counts[el]}`)
		.join(",");

const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

function cleanFormula(cell) {
	return cell
		.replace(/<ref[^>]*\/>/g, "")
		.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
		.replace(/\{\{chem2\|([^}]*)\}\}/g, "$1")
		.replace(/\{\{chem\|([^}]*)\}\}/g, (_, s) => s.replace(/\|/g, ""))
		.replace(/<\/?su[bp]>/g, "")
		.replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, "$1")
		.replace(/\[\[([^\]]*)\]\]/g, "$1")
		.replace(/'''?/g, "")
		.replace(/&nbsp;/g, "")
		.trim();
}

function cleanName(cell) {
	const s = cell.replace(/<ref[\s\S]*?(\/>|<\/ref>)/g, "").split(/<br\s*\/?>/)[0];
	const link = s.match(/\[\[([^|\]]*)(?:\|([^\]]*))?\]\]/);
	const name = link ? link[2] || link[1] : s;
	return name.replace(/'''?|''/g, "").replace(/\{\{[^}]*\}\}/g, "").trim();
}

/** Rows of the glossary's wikitables: { formula, name }. */
function parseGlossary(text) {
	const out = [];
	const rows = text.split(/\n\|-[^\n]*/);
	let spanFormula = null;
	let spanLeft = 0;
	for (const row of rows) {
		const lines = row
			.split("\n")
			.filter((l) => l.startsWith("|") && !l.startsWith("|}") && !l.startsWith("|+"));
		if (!lines.length) continue;
		const cells = lines
			.map((l) => l.slice(1))
			.join("||")
			.split("||")
			.map((c) => c.trim());
		let formula;
		let name;
		const span = cells[0].match(/rowspan\s*=\s*"?(\d+)"?\s*\|(.*)$/);
		if (span) {
			spanFormula = cleanFormula(span[2]);
			spanLeft = Number(span[1]) - 1;
			formula = spanFormula;
			name = cleanName(cells[1] || "");
		} else if (spanLeft > 0) {
			spanLeft--;
			formula = spanFormula;
			name = cleanName(cells[0]);
		} else {
			formula = cleanFormula(cells[0]);
			name = cleanName(cells[1] || "");
		}
		if (formula && name) out.push({ formula, name, source: "glossary" });
	}
	return out;
}

/** Bullets of "List of inorganic compounds": "* [[Name]] (...) – formula". */
function parseInorganic(text) {
	const out = [];
	for (const line of text.split("\n")) {
		if (!line.startsWith("*")) continue;
		const m = line.match(/^\*+\s*(.*?)\s+[–—-]\s+(.*)$/);
		if (!m) continue;
		const name = cleanName(m[1]);
		const formula = cleanFormula(m[2].replace(/<ref[\s\S]*$/, "")).split(/\s/)[0];
		if (formula && name) out.push({ formula, name, source: "inorganic" });
	}
	return out;
}

async function buildPool() {
	const rows = [
		...parseGlossary(await wikitext("Glossary_of_chemical_formulae")),
		...parseInorganic(await wikitext("List_of_inorganic_compounds")),
	];
	const pool = new Map();
	for (const r of rows) {
		const counts = parseFormula(r.formula);
		if (!counts) continue;
		const n = total(counts);
		if (n < 2 || n > 10) continue;
		if (!Object.keys(counts).every((el) => ALLOWED.has(el))) continue;
		const key = keyOf(counts);
		if (!pool.has(key)) pool.set(key, { counts, rows: [] });
		pool.get(key).rows.push(r);
	}
	return pool;
}

async function pubchemFormula(cid) {
	const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,Title/JSON`;
	const json = JSON.parse(await cached(`pubchem-${cid}.json`, url));
	return json.PropertyTable.Properties[0];
}

// ---------------------------------------------------------------------------
// Curated selection. Each line: written formula | display name [| pubchem CID].
// Lines without a CID must match a Wikipedia row by atom counts; lines with a
// CID are checked against that PubChem record instead.
// ---------------------------------------------------------------------------
const CURATED = `
# --- Core molecules the sandbox must always have
H2 | Hydrogen gas
O2 | Oxygen
N2 | Nitrogen gas
H2O | Water
CO2 | Carbon dioxide
CH4 | Methane
NH3 | Ammonia
O3 | Ozone
H2O2 | Hydrogen peroxide
NaCl | Sodium chloride
SiO2 | Silicon dioxide
Fe2O3 | Iron(III) oxide
CaCO3 | Calcium carbonate

# --- Other elemental molecules
F2 | Fluorine
Cl2 | Chlorine
Br2 | Bromine
I2 | Iodine
P4 | White phosphorus | 123286
S8 | Octasulfur | 66348

# --- Atmosphere: gases, acids, trace and man-made species
CO | Carbon monoxide
NO | Nitric oxide
NO2 | Nitrogen dioxide
N2O | Nitrous oxide
N2O3 | Dinitrogen trioxide
N2O4 | Dinitrogen tetroxide
N2O5 | Dinitrogen pentoxide
SO2 | Sulfur dioxide
SO3 | Sulfur trioxide
HNO3 | Nitric acid
HNO2 | Nitrous acid
H2SO4 | Sulfuric acid
H2SO3 | Sulfurous acid
H2CO3 | Carbonic acid
HCl | Hydrogen chloride
HF | Hydrogen fluoride
HBr | Hydrogen bromide
HI | Hydrogen iodide
H2S | Hydrogen sulfide
COS | Carbonyl sulfide
CS2 | Carbon disulfide
HCN | Hydrogen cyanide
HOCl | Hypochlorous acid
HOBr | Hypobromous acid
ClO2 | Chlorine dioxide
Cl2O | Dichlorine monoxide
ClONO2 | Chlorine nitrate | 114934
NOCl | Nitrosyl chloride
NO2Cl | Nitryl chloride
CCl2F2 | Dichlorodifluoromethane
CCl3F | Trichlorofluoromethane
CHClF2 | Chlorodifluoromethane
CF4 | Tetrafluoromethane
SF6 | Sulfur hexafluoride
NF3 | Nitrogen trifluoride
CCl4 | Carbon tetrachloride
CHCl3 | Chloroform
CH2Cl2 | Dichloromethane
CH3Cl | Chloromethane
CH3Br | Bromomethane | 6323
CH3I | Iodomethane
COCl2 | Phosgene
BrCl | Bromine monochloride
ICl | Iodine monochloride
ClF3 | Chlorine trifluoride

# --- Small organics and biomolecules (living cell, meteorite organics)
CH3OH | Methanol
C2H5OH | Ethanol
CH2O | Formaldehyde
HCOOH | Formic acid
CH3COOH | Acetic acid
CH3CHO | Acetaldehyde
CO(NH2)2 | Urea
NH2CH2COOH | Glycine
CH3COCOOH | Pyruvic acid
HOOCCOOH | Oxalic acid
OHCCHO | Glyoxal
HCONH2 | Formamide
CH3CONH2 | Acetamide
NH2COOH | Carbamic acid
HNC(NH2)2 | Guanidine
CH2(OH)2 | Methanediol
HOCH2CH2OH | Ethylene glycol
CH3COCH3 | Acetone
CH3NH2 | Methylamine
(CH3)2NH | Dimethylamine
CH3SH | Methanethiol
(CH3)2S | Dimethyl sulfide
(CH3)2SO | Dimethyl sulfoxide
CH3CN | Acetonitrile
HNCO | Isocyanic acid
NH2CH2CN | Aminoacetonitrile
HOCH2CN | Glycolonitrile
C3H4N2 | Imidazole
C4H4O | Furan
C2H2 | Acetylene
C2H4 | Ethylene
C2H6 | Ethane
CH3CCH | Propyne
CH3CHCH2 | Propylene
C4H2 | Diacetylene
HC3N | Cyanoacetylene
CH2CHCN | Acrylonitrile
CH2(CN)2 | Malononitrile
(CN)2 | Cyanogen
C2H3Cl | Vinyl chloride
N2H4 | Hydrazine
N2H2 | Diazene
NH2OH | Hydroxylamine
HN3 | Hydrazoic acid
H3PO4 | Phosphoric acid
H3PO3 | Phosphorous acid
H3PO2 | Hypophosphorous acid
NH4Cl | Ammonium chloride
NH4NO3 | Ammonium nitrate
NH4HCO3 | Ammonium bicarbonate
HCOONH4 | Ammonium formate
HCOONa | Sodium formate
CH3COONa | Sodium acetate

# --- Gas giant: hydrides and cloud-deck chemistry
PH3 | Phosphine
NH4SH | Ammonium hydrosulfide
GeH4 | Germane
AsH3 | Arsine
SiH4 | Silane
Si2H6 | Disilane
Ge2H6 | Digermane
SnH4 | Stannane
SbH3 | Stibine
H2Se | Hydrogen selenide
H2Te | Hydrogen telluride
BH3 | Borane
B2H6 | Diborane
HAt | Hydrogen astatide

# --- Sea salts, brines, evaporites and water chemistry
KCl | Potassium chloride
MgCl2 | Magnesium chloride
CaCl2 | Calcium chloride
MgSO4 | Magnesium sulfate
NaHCO3 | Sodium bicarbonate
Na2CO3 | Sodium carbonate
Na2SO4 | Sodium sulfate
K2SO4 | Potassium sulfate
CaSO4 | Calcium sulfate
KHCO3 | Potassium bicarbonate
K2CO3 | Potassium carbonate
NaBr | Sodium bromide
KBr | Potassium bromide
MgBr2 | Magnesium bromide
NaI | Sodium iodide
KI | Potassium iodide
NaF | Sodium fluoride
KF | Potassium fluoride
LiCl | Lithium chloride
SrCl2 | Strontium chloride
H3BO3 | Boric acid
Si(OH)4 | Orthosilicic acid
NaOH | Sodium hydroxide
KOH | Potassium hydroxide
LiOH | Lithium hydroxide
Ca(OH)2 | Calcium hydroxide
Mg(OH)2 | Magnesium hydroxide
NaNO3 | Sodium nitrate
KNO3 | Potassium nitrate
NaNO2 | Sodium nitrite
Ca(NO3)2 | Calcium nitrate
Mg(NO3)2 | Magnesium nitrate
NaOCl | Sodium hypochlorite
Ca(ClO)2 | Calcium hypochlorite
NaClO3 | Sodium chlorate
KClO3 | Potassium chlorate
KClO4 | Potassium perchlorate
KIO3 | Potassium iodate
NaHSO4 | Sodium bisulfate
Na2SO3 | Sodium sulfite
Na2S2O3 | Sodium thiosulfate
Na2S | Sodium sulfide
NaHS | Sodium hydrosulfide
Na3PO4 | Trisodium phosphate
Na2HPO4 | Disodium phosphate
NaH2PO4 | Monosodium phosphate
KH2PO4 | Monopotassium phosphate
CaHPO4 | Dicalcium phosphate
UO2CO3 | Uranyl carbonate
Li2CO3 | Lithium carbonate
HClO4 | Perchloric acid
HIO3 | Iodic acid
H2SeO4 | Selenic acid
H3AsO4 | Arsenic acid

# --- Crust: rock-forming oxides and minerals
Al2O3 | Aluminium oxide
Fe3O4 | Iron(II,III) oxide
FeO | Iron(II) oxide
MgO | Magnesium oxide
CaO | Calcium oxide
MgCO3 | Magnesium carbonate
FeS2 | Iron disulfide
TiO2 | Titanium dioxide
K2O | Potassium oxide
Na2O | Sodium oxide
CaF2 | Calcium fluoride
ZnS | Zinc sulfide
PbS | Lead(II) sulfide
Cu2O | Copper(I) oxide
CuO | Copper(II) oxide
MnO | Manganese(II) oxide
MnO2 | Manganese dioxide
Mn2O3 | Manganese(III) oxide
Mn3O4 | Manganese(II,III) oxide
Cr2O3 | Chromium(III) oxide
FeCr2O4 | Iron(II) chromite
FeTiO3 | Iron(II) titanate
ZrSiO4 | Zirconium silicate
ZrO2 | Zirconium dioxide
SnO2 | Tin(IV) oxide
UO2 | Uranium dioxide
ThO2 | Thorium dioxide
Al2SiO5 | Aluminium silicate
CaSiO3 | Calcium metasilicate
MgSiO3 | Magnesium metasilicate
CaMg(CO3)2 | Calcium magnesium carbonate | 61833
LiAlSi2O6 | Lithium aluminium silicate
Be2SiO4 | Beryllium silicate | 27131
BeAl2O4 | Beryllium aluminium oxide
Zn2SiO4 | Zinc orthosilicate
BaSO4 | Barium sulfate
SrSO4 | Strontium sulfate
SrCO3 | Strontium carbonate
BaCO3 | Barium carbonate
ZnCO3 | Zinc carbonate
PbCO3 | Lead(II) carbonate
PbSO4 | Lead(II) sulfate
MnCO3 | Manganese(II) carbonate
FeCO3 | Iron(II) carbonate
Cu2CO3(OH)2 | Basic copper carbonate
CuFeS2 | Copper iron sulfide
MoS2 | Molybdenum disulfide
Sb2S3 | Antimony trisulfide
As4S4 | Tetraarsenic tetrasulfide
As2S3 | Arsenic trisulfide | 71586773
HgS | Mercury(II) sulfide
CdS | Cadmium sulfide
Ag2S | Silver sulfide
CuS | Copper(II) sulfide
Cu2S | Copper(I) sulfide
NiAs | Nickel arsenide
FeAsS | Iron arsenic sulfide
NiAsS | Nickel arsenic sulfide
Bi2S3 | Bismuth(III) sulfide
AuTe2 | Gold ditelluride
CaWO4 | Calcium tungstate
FeWO4 | Iron(II) tungstate
ZnO | Zinc oxide
Al(OH)3 | Aluminium hydroxide
AlO(OH) | Aluminium oxide hydroxide | 73982
FeO(OH) | Iron(III) oxide-hydroxide
MnO(OH) | Manganese(III) oxide-hydroxide
LaPO4 | Lanthanum phosphate
CePO4 | Cerium(III) phosphate | 159673
YPO4 | Yttrium phosphate
Na3AlF6 | Sodium hexafluoroaluminate
WO3 | Tungsten trioxide
MoO3 | Molybdenum trioxide
V2O5 | Vanadium pentoxide
Nb2O5 | Niobium pentoxide | 9903420
Ta2O5 | Tantalum pentoxide
Bi2O3 | Bismuth(III) oxide
Sb2O3 | Antimony trioxide
As2O3 | Arsenic trioxide
GeO2 | Germanium dioxide
Ga2O3 | Gallium(III) oxide
In2O3 | Indium(III) oxide
Tl2O3 | Thallium(III) oxide
CdO | Cadmium oxide
HgO | Mercury(II) oxide
PbO | Lead(II) oxide
PbO2 | Lead dioxide
Ag2O | Silver oxide
Au2O3 | Gold(III) oxide
NiO | Nickel(II) oxide
CoO | Cobalt(II) oxide
Co3O4 | Cobalt(II,III) oxide
CrO3 | Chromium trioxide
V2O3 | Vanadium(III) oxide
Sc2O3 | Scandium oxide
Y2O3 | Yttrium oxide
La2O3 | Lanthanum oxide
CeO2 | Cerium dioxide
Pr2O3 | Praseodymium(III) oxide
Nd2O3 | Neodymium(III) oxide
Sm2O3 | Samarium(III) oxide
Eu2O3 | Europium(III) oxide
Gd2O3 | Gadolinium(III) oxide
Tb2O3 | Terbium(III) oxide
Dy2O3 | Dysprosium(III) oxide
Ho2O3 | Holmium(III) oxide
Er2O3 | Erbium(III) oxide
Tm2O3 | Thulium(III) oxide
Yb2O3 | Ytterbium(III) oxide
Lu2O3 | Lutetium(III) oxide | 4323797
HfO2 | Hafnium dioxide
Re2O7 | Rhenium(VII) oxide
OsO4 | Osmium tetroxide
IrO2 | Iridium(IV) oxide
RuO4 | Ruthenium tetroxide
Rh2O3 | Rhodium(III) oxide
Ac2O3 | Actinium(III) oxide
PoO2 | Polonium dioxide
Li2O | Lithium oxide
Rb2O | Rubidium oxide
Cs2O | Caesium oxide
BeO | Beryllium oxide
SrO | Strontium oxide
BaO | Barium oxide
B2O3 | Boron trioxide
P2O5 | Phosphorus pentoxide
SeO2 | Selenium dioxide
TeO2 | Tellurium dioxide
I2O5 | Iodine pentoxide

# --- Meteorite (CI chondrite): silicates, sulfides, refractory phases
Mg2SiO4 | Magnesium orthosilicate
Fe2SiO4 | Iron(II) orthosilicate
FeS | Iron(II) sulfide
NiS | Nickel(II) sulfide
MgAl2O4 | Magnesium aluminate
CaTiO3 | Calcium titanate
SiC | Silicon carbide
TiN | Titanium nitride
Fe3P | Iron phosphide
FePO4 | Iron(III) phosphate
Fe(OH)3 | Iron(III) hydroxide
FeSO4 | Iron(II) sulfate
MgS | Magnesium sulfide
CaS | Calcium sulfide
CrN | Chromium nitride | 90362

# --- Halides across the periodic table
LiF | Lithium fluoride
RbCl | Rubidium chloride
CsCl | Caesium chloride
FrCl | Francium chloride
BeCl2 | Beryllium chloride
MgF2 | Magnesium fluoride
BaCl2 | Barium chloride
RaCl2 | Radium chloride
AlCl3 | Aluminium chloride
AlF3 | Aluminium fluoride
GaCl3 | Gallium trichloride
InCl3 | Indium(III) chloride
TlCl | Thallium(I) chloride
BF3 | Boron trifluoride
BCl3 | Boron trichloride
SiCl4 | Silicon tetrachloride
SiF4 | Silicon tetrafluoride
GeCl4 | Germanium tetrachloride
SnCl2 | Tin(II) chloride
SnCl4 | Tin(IV) chloride
PbCl2 | Lead(II) chloride
PbI2 | Lead(II) iodide
PCl3 | Phosphorus trichloride
PCl5 | Phosphorus pentachloride
POCl3 | Phosphoryl chloride
AsCl3 | Arsenic trichloride
SbCl3 | Antimony trichloride
BiCl3 | Bismuth(III) chloride
BiOCl | Bismuth oxychloride
S2Cl2 | Disulfur dichloride
SOCl2 | Thionyl chloride
SO2Cl2 | Sulfuryl chloride
NCl3 | Nitrogen trichloride
SeCl4 | Selenium tetrachloride
TeCl4 | Tellurium tetrachloride
ScCl3 | Scandium chloride
TiCl4 | Titanium tetrachloride
VCl4 | Vanadium(IV) chloride
CrCl3 | Chromium(III) chloride
MnCl2 | Manganese(II) chloride
FeCl2 | Iron(II) chloride
FeCl3 | Iron(III) chloride
CoCl2 | Cobalt(II) chloride
NiCl2 | Nickel(II) chloride
CuCl | Copper(I) chloride
CuCl2 | Copper(II) chloride
ZnCl2 | Zinc chloride
YCl3 | Yttrium chloride
ZrCl4 | Zirconium tetrachloride
NbCl5 | Niobium pentachloride
MoCl5 | Molybdenum(V) chloride
RuCl3 | Ruthenium(III) chloride
RhCl3 | Rhodium(III) chloride
PdCl2 | Palladium(II) chloride
AgCl | Silver chloride
AgBr | Silver bromide
AgI | Silver iodide
CdCl2 | Cadmium chloride
HfCl4 | Hafnium(IV) chloride
TaCl5 | Tantalum(V) chloride
WCl6 | Tungsten hexachloride
WF6 | Tungsten hexafluoride
ReCl5 | Rhenium(V) chloride
OsCl3 | Osmium(III) chloride
IrCl3 | Iridium(III) chloride
PtCl4 | Platinum(IV) chloride
AuCl3 | Gold(III) chloride
HAuCl4 | Chloroauric acid
H2PtCl6 | Chloroplatinic acid
HgCl2 | Mercury(II) chloride
Hg2Cl2 | Mercury(I) chloride
AcCl3 | Actinium(III) chloride
ThCl4 | Thorium(IV) chloride
PaCl5 | Protactinium(V) chloride
UF6 | Uranium hexafluoride
UCl4 | Uranium tetrachloride

# --- Common inorganic salts, hydrides, carbides, nitrides
KMnO4 | Potassium permanganate
K2CrO4 | Potassium chromate
Na2MoO4 | Sodium molybdate
Na2WO4 | Sodium tungstate
CuSO4 | Copper(II) sulfate
ZnSO4 | Zinc sulfate
NiSO4 | Nickel(II) sulfate
AgNO3 | Silver nitrate
Cu(NO3)2 | Copper(II) nitrate
Pb(NO3)2 | Lead(II) nitrate
CuCO3 | Copper(II) carbonate
CaC2O4 | Calcium oxalate
AlPO4 | Aluminium phosphate
LiCoO2 | Lithium cobalt oxide
LiFePO4 | Lithium iron phosphate
BaTiO3 | Barium titanate
SrTiO3 | Strontium titanate
LiNbO3 | Lithium niobate
YVO4 | Yttrium vanadate
PbCrO4 | Lead(II) chromate
NaH | Sodium hydride
LiH | Lithium hydride
CaH2 | Calcium hydride
MgH2 | Magnesium hydride
NaBH4 | Sodium borohydride
LiAlH4 | Lithium aluminium hydride
NaN3 | Sodium azide
KCN | Potassium cyanide
NaCN | Sodium cyanide
KSCN | Potassium thiocyanate
ClCN | Cyanogen chloride
CaCN2 | Calcium cyanamide
CaC2 | Calcium carbide
Al4C3 | Aluminium carbide
B4C | Boron carbide
TiC | Titanium carbide
ZrC | Zirconium carbide
WC | Tungsten carbide
BN | Boron nitride
AlN | Aluminium nitride
GaN | Gallium nitride
Si3N4 | Silicon nitride
ZrN | Zirconium nitride
Ca3N2 | Calcium nitride
S4N4 | Tetrasulfur tetranitride
P4S3 | Phosphorus sesquisulfide
MgB2 | Magnesium diboride
LaB6 | Lanthanum hexaboride

# --- Sulfides, selenides, tellurides, arsenides, phosphides, antimonides
K2S | Potassium sulfide
BaS | Barium sulfide
Al2S3 | Aluminium sulfide
MnS | Manganese(II) sulfide
SnS2 | Tin(IV) sulfide
ZnSe | Zinc selenide
CdSe | Cadmium selenide
ZnTe | Zinc telluride
CdTe | Cadmium telluride
PbTe | Lead(II) telluride
Bi2Te3 | Bismuth telluride
GaAs | Gallium arsenide
InAs | Indium arsenide
GaP | Gallium phosphide
InP | Indium phosphide
GaSb | Gallium antimonide
InSb | Indium antimonide
`;

async function main() {
	const pool = await buildPool();
	if (args.includes("--pool")) {
		const lines = [...pool.values()]
			.sort((a, b) => keyOf(a.counts).localeCompare(keyOf(b.counts)))
			.map(
				(p) =>
					`${keyOf(p.counts)}\t${p.rows.map((r) => `${r.formula} = ${r.name} [${r.source[0]}]`).join(" ; ")}`,
			);
		console.log(lines.join("\n"));
		console.error(`${pool.size} distinct count-multisets in pool`);
		return;
	}

	const out = [];
	const seen = new Map();
	const errors = [];
	for (const line of CURATED.split("\n")) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const [formula, name, cid] = t.split("|").map((s) => s.trim());
		const counts = parseFormula(formula);
		if (!counts) {
			errors.push(`unparseable formula ${formula}`);
			continue;
		}
		const key = keyOf(counts);
		if (seen.has(key)) {
			errors.push(`${formula} duplicates counts of ${seen.get(key)}`);
			continue;
		}
		let source;
		if (cid) {
			const p = await pubchemFormula(cid);
			const pc = parseFormula(p.MolecularFormula);
			if (!pc || keyOf(pc) !== key) {
				errors.push(`${formula}: PubChem CID ${cid} is ${p.MolecularFormula} (${p.Title})`);
				continue;
			}
			source = `PubChem CID ${cid} (${p.Title})`;
		} else {
			const hit = pool.get(key);
			if (!hit) {
				errors.push(`${formula} (${name}) not found in Wikipedia pool`);
				continue;
			}
			source = hit.rows.map((r) => r.name).join(" / ");
		}
		seen.set(key, formula);
		out.push({ formula, name, counts, _source: source });
	}
	if (errors.length) {
		console.error(errors.join("\n"));
		process.exit(1);
	}
	if (args.includes("--sources")) {
		for (const e of out) console.log(`${e.formula}\t${e.name}\t${e._source}`);
		return;
	}
	const clean = out.map(({ formula, name, counts }) => ({ formula, name, counts }));
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(clean, null, "\t")}\n`);
	console.error(`wrote ${clean.length} recipes to ${OUT}`);
}

await main();
