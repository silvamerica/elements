#!/usr/bin/env node
// Builds src/chemistry/data/elements.json and worlds.json from published
// sources fetched at run time. Run with plain `node scripts/build-elements.mjs`
// (Node 18+, uses global fetch). See src/chemistry/data/sources-elements.md.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/chemistry/data");

const UA = { "User-Agent": "water-sandbox-data-build/1.0" };

// Optional on-disk cache (set BUILD_ELEMENTS_CACHE=/some/dir) so reruns do
// not hammer Wikipedia, which rate-limits bursts with HTTP 429.
const CACHE = process.env.BUILD_ELEMENTS_CACHE;
async function text(url) {
  const key = CACHE && join(CACHE, createHash("sha1").update(url).digest("hex"));
  if (key && existsSync(key)) return readFileSync(key, "utf8");
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 429 && attempt < 5) {
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} fetching ${url}`);
    const t = await r.text();
    if (key) mkdirSync(CACHE, { recursive: true }), writeFileSync(key, t);
    return t;
  }
}
async function wiki(page) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&page=" +
    encodeURIComponent(page);
  const j = JSON.parse(await text(url));
  if (!j.parse) throw new Error(`no wikitext for ${page}`);
  return j.parse.wikitext;
}

const SRC = {
  ptable: "https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/PeriodicTableJSON.json",
  jmol: "https://raw.githubusercontent.com/BobHanson/Jmol-SwingJS/master/src/org/jmol/c/PAL.java",
  lodders: "https://raw.githubusercontent.com/MESAHub/mesa/main/chem/data/lodders03.data",
  ci: "https://raw.githubusercontent.com/morganjwilliams/pyrolite/main/pyrolite/data/geochem/refcomp/CH_PalmeONeill2014.csv",
};

// Strip refs and templates from a wikitext table cell, return first number.
function cellNumber(cell) {
  if (cell == null) return null;
  let c = cell
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[#[^\]]*\]\]/g, "");
  if (/^\s*style="[^"]*"\s*\|/.test(c)) c = c.replace(/^\s*style="[^"]*"\s*\|/, "");
  const m = c.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// ---------- elements ----------

function parseJmol(src) {
  const start = src.indexOf("argbsCpk = {");
  const body = src.slice(start, src.indexOf("};", start));
  const out = {};
  for (const m of body.matchAll(/0x([0-9A-Fa-f]{8}),\s*\/\/\s*(\w+)\s+(\d+)/g)) {
    out[Number(m[3])] = "#" + m[1].slice(2).toUpperCase();
  }
  return out; // 0 = Xx (unknown element), 1..109
}

function parseRadii(wt) {
  const rows = wt.split(/\n\|-/);
  const out = {};
  for (const r of rows) {
    const lines = r.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|}"));
    if (!lines.length) continue;
    const head = lines[0].match(/^\|\s*(\d+)\s*\|\|\s*([A-Z][a-z]?)\s*\|\|/);
    if (!head) continue;
    const cells = lines.slice(1).map((l) => l.slice(1));
    // empirical, calculated, vdW, covalent single, covalent triple, metallic
    out[Number(head[1])] = {
      empirical: cellNumber(cells[0]),
      calculated: cellNumber(cells[1]),
      covalent: cellNumber(cells[3]),
      triple: cellNumber(cells[4]),
    };
  }
  return out;
}

// Pyykkö & Atsumi 2009 single-bond radii (first of the single/double/triple
// values in each cell) from the "Radius for multiple bonds" periodic grid on
// Wikipedia "Covalent radius". Each block is a row of atomic numbers followed
// by a row of "single<br>double<br>triple" value cells.
function parsePyykko(wt) {
  const sec = wt.slice(wt.indexOf("==Radius for multiple bonds=="));
  const rows = sec.split(/\n\|-[^\n]*\n/);
  const cellsOf = (row) =>
    row
      .split(/\|\||\n\|/)
      .map((c) => c.replace(/^\|/, "").replace(/^[^|]*style="[^"]*"\s*\|/, "").trim());
  const out = {};
  for (let i = 0; i < rows.length - 1; i++) {
    const zs = cellsOf(rows[i]).filter((c) => /^\d+$/.test(c)).map(Number);
    if (zs.length < 2 || !zs.every((z) => z >= 1 && z <= 118)) continue;
    const vals = cellsOf(rows[i + 1]).filter((c) => c.includes("<br>"));
    if (vals.length !== zs.length) continue;
    zs.forEach((z, k) => (out[z] = cellNumber(vals[k].split("<br>")[0])));
  }
  return out;
}

function parseLodders(src) {
  const out = {};
  for (const line of src.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+([A-Z][a-z]?)\s+(\d+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
    if (!m) continue;
    out[Number(m[1])] = (out[Number(m[1])] || 0) + Number(m[5]);
  }
  return out; // atoms per 1e6 Si, summed over isotopes
}

// ---------- world helpers ----------

function massToAtom(massBySym, mass) {
  const atoms = {};
  for (const [s, w] of Object.entries(massBySym)) {
    if (!(s in mass)) throw new Error(`unknown symbol ${s}`);
    atoms[s] = w / mass[s];
  }
  return atoms;
}
function normalise(obj, natural) {
  const keep = Object.entries(obj).filter(([s, v]) => natural.has(s) && v > 0);
  const total = keep.reduce((a, [, v]) => a + v, 0);
  const out = {};
  keep.sort((a, b) => b[1] - a[1]).forEach(([s, v]) => (out[s] = Number((v / total).toPrecision(10))));
  return out;
}

// Columns of Wikipedia "Abundances of the elements (data page)".
function parseDataPageColumn(wt, sectionStart, sectionEnd, col) {
  const s = wt.slice(wt.indexOf(sectionStart), wt.indexOf(sectionEnd));
  const out = {};
  for (const r of s.split("\n|-")) {
    const h = r.match(/<!--\s*(\d+)\s+([A-Z][a-z]?)\s*-->/);
    if (!h) continue;
    const c = r.match(new RegExp(`<!--${col}-->[^\\n]*data-sort-value="([^"]+)"`));
    if (c) out[h[2]] = Number(c[1]);
  }
  return out;
}

// Wikipedia "Composition of the human body", elemental list, Mass (kg)
// column (Emsley 2011, 70 kg body). Fallback to the mass-fraction column
// (x 70 kg) where the kg cell is empty.
function parseBody(wt, symByZ, nameByZ) {
  const start = wt.indexOf("===Elemental composition list===");
  const s = wt.slice(start, wt.indexOf("===Periodic table===", start));
  const val = (cell) => {
    if (!cell) return null;
    const c = cell.replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "");
    const v = c.match(/\{\{val\|([\d.]+)\|e=([−-]?\d+)\}\}/);
    if (v) return Number(v[1]) * 10 ** Number(v[2].replace("−", "-"));
    const d = c.match(/data-sort-value="([^"]+)"/);
    if (d) return Number(d[1]);
    const n = c.replace(/\|/g, "").trim().match(/^[\d.]+/);
    return n ? Number(n[0]) : null;
  };
  const out = {};
  const notes = [];
  for (const r of s.split("\n|-")) {
    const line = r.replace(/^\n/, "").replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "");
    const m = line.match(/^\|\s*(\d+)\s*\|\|\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\*?\s*\|\|(.*)$/m);
    if (!m) continue;
    const sym = symByZ[Number(m[1])];
    if (!sym) throw new Error(`body: unknown Z ${m[1]}`);
    const cells = m[4].split("||");
    let kg = val(cells[1]);
    if (kg == null) {
      // The table is sorted by kg; its sort key agrees with the row order
      // where the displayed {{val}} does not (Ge), so prefer the sort key.
      const d = cells[0] && cells[0].match(/data-sort-value="([^"]+)"/);
      const frac = d ? Number(d[1]) : val(cells[0]);
      if (frac != null) {
        kg = frac * 70;
        notes.push(`${sym}: no kg value, used mass fraction ${frac} x 70 kg`);
      }
    }
    if (kg != null) out[sym] = kg;
  }
  return { out, notes };
}

function parseCI(csv) {
  const out = {};
  for (const line of csv.split("\n").slice(1)) {
    const [v, value, units] = line.split(",");
    if (!value || !/^[A-Z][a-z]?$/.test(v)) continue;
    const x = Number(value);
    out[v] = units === "%" ? x * 1e4 : units === "ppm" ? x : NaN;
    if (Number.isNaN(out[v])) throw new Error(`CI: bad unit ${units} for ${v}`);
  }
  return out; // ppm by mass
}

// ---------- main ----------

const ptableTxt = await text(SRC.ptable);
const jmolTxt = await text(SRC.jmol);
const loddersTxt = await text(SRC.lodders);
const ciTxt = await text(SRC.ci);
const radiiWt = await wiki("Atomic radii of the elements (data page)");
const covWt = await wiki("Covalent radius");
const abundWt = await wiki("Abundances of the elements (data page)");
const bodyWt = await wiki("Composition of the human body");

const ptable = JSON.parse(ptableTxt).elements.filter((e) => e.number <= 118);
const jmol = parseJmol(jmolTxt);
const radii = parseRadii(radiiWt);
const pyykko = parsePyykko(covWt);
console.log("Pyykkö single-bond radii parsed:", Object.keys(pyykko).length);
const lodders = parseLodders(loddersTxt);

const NOBLE = new Set(["He", "Ne", "Ar", "Kr", "Xe", "Rn", "Og"]);
const radiusNotes = [];
const colorNotes = [];

const elements = ptable.map((e) => {
  const z = e.number;
  const r = radii[z] || {};
  let radiusPm = r.empirical;
  let how = "empirical";
  if (radiusPm == null && r.calculated != null) (radiusPm = r.calculated), (how = "calculated");
  if (radiusPm == null && r.covalent != null) (radiusPm = r.covalent), (how = "covalent (single)");
  if (radiusPm == null && pyykko[z] != null) (radiusPm = pyykko[z]), (how = "Pyykkö 2009 single-bond covalent");
  if (radiusPm == null) throw new Error(`no radius for ${e.symbol}`);
  if (how !== "empirical") radiusNotes.push(`${e.symbol} ${radiusPm} (${how})`);
  let color = jmol[z];
  if (!color) {
    color = jmol[0];
    colorNotes.push(e.symbol);
  }
  return {
    z,
    symbol: e.symbol,
    name: e.name,
    color,
    radiusPm,
    natural: z <= 92 && z !== 43 && z !== 61,
    noble: NOBLE.has(e.symbol),
    cosmic: lodders[z] != null ? Number(lodders[z].toPrecision(4)) : null,
  };
});

const mass = Object.fromEntries(ptable.map((e) => [e.symbol, e.atomic_mass]));
const symByZ = Object.fromEntries(ptable.map((e) => [e.number, e.symbol]));
const nameByZ = Object.fromEntries(ptable.map((e) => [e.number, e.name]));
const natural = new Set(elements.filter((e) => e.natural).map((e) => e.symbol));

// Ocean: CRC W1 seawater mass concentration (kg/L).
const ocean = parseDataPageColumn(abundWt, "==Sea water==", "==Sun and Solar System==", "W1");
// Crust: CRC C1 continental crust mass fraction (kg/kg).
const crust = parseDataPageColumn(abundWt, "==Earth bulk continental crust", "==Urban soils==", "C1");
// Cell: Emsley human body kg.
const body = parseBody(bodyWt, symByZ, nameByZ);
// Meteorite: Palme & O'Neill 2014 CI chondrite (ppm by mass).
const ci = parseCI(ciTxt);

// Atmosphere: molecular mole fractions (ppm, dry air) from Wikipedia
// "Atmosphere of Earth" (Allen's Astrophysical Quantities 2002 + WMO GHG
// Bulletin 21 for 2024 CO2/CH4), H2 from NASA Earth Fact Sheet, Xe from
// Wikipedia "Xenon" (87 nL/L), N2O from Wikipedia "Nitrous oxide" (339 ppb,
// 2025). Water vapour: 0.25% of the atmosphere by mass (same Wikipedia page),
// converted to moles with dry-air molar mass 28.964 g/mol.
const dry = { N2: 780840, O2: 209460, Ar: 9340, CO2: 423.9, Ne: 18.2, He: 5.24, CH4: 1.94, Kr: 1.14, H2: 0.55, Xe: 0.087, N2O: 0.339 };
const drySum = Object.values(dry).reduce((a, b) => a + b, 0);
const molDry = Object.fromEntries(Object.entries(dry).map(([k, v]) => [k, v / drySum]));
const h2oPerDry = 0.0025 / 18.015 / (0.9975 / 28.964);
const atm = {
  N: 2 * molDry.N2 + 2 * molDry.N2O,
  O: 2 * molDry.O2 + 2 * molDry.CO2 + molDry.N2O + h2oPerDry,
  C: molDry.CO2 + molDry.CH4,
  H: 4 * molDry.CH4 + 2 * molDry.H2 + 2 * h2oPerDry,
  Ar: molDry.Ar,
  Ne: molDry.Ne,
  He: molDry.He,
  Kr: molDry.Kr,
  Xe: molDry.Xe,
};

// Jupiter: element/H = solar X/H x Jupiter/Sun (Atreya et al. 2003, table in
// Wikipedia "Atmosphere of Jupiter"). N uses the 8 bar value 3.6; O uses the
// midpoint 0.385 of the deepest (19 bar) Galileo range 0.19-0.58.
const jup = {
  H: 1,
  He: 0.0975 * 0.807,
  Ne: 1.23e-4 * 0.1,
  Ar: 3.62e-6 * 2.5,
  Kr: 1.61e-9 * 2.7,
  Xe: 1.68e-10 * 2.6,
  C: 3.62e-4 * 2.9,
  N: 1.12e-4 * 3.6,
  O: 8.51e-4 * ((0.19 + 0.58) / 2),
  P: 3.73e-7 * 0.82,
  S: 1.62e-5 * 2.5,
};

const worlds = [
  {
    id: "ocean",
    name: "Ocean",
    blurb: "Salt, water and a pinch of everything the rivers ever carried.",
    abundance: normalise(massToAtom(ocean, mass), natural),
  },
  {
    id: "crust",
    name: "Crust",
    blurb: "Silicate bedrock: oxygen locked in stone with silicon, aluminium and iron.",
    abundance: normalise(massToAtom(crust, mass), natural),
  },
  {
    id: "atmosphere",
    name: "Atmosphere",
    blurb: "Thin blue air of nitrogen and oxygen, with a breath of argon and water.",
    abundance: normalise(atm, natural),
  },
  {
    id: "cell",
    name: "Cell",
    blurb: "Warm wet carbon chemistry: the recipe for a living body.",
    abundance: normalise(massToAtom(body.out, mass), natural),
  },
  {
    id: "gasgiant",
    name: "Gas Giant",
    blurb: "Jupiter's endless hydrogen sky, laced with helium, methane and ammonia.",
    abundance: normalise(jup, natural),
  },
  {
    id: "meteorite",
    name: "Meteorite",
    blurb: "A crumb of the primordial solar nebula, unchanged for 4.6 billion years.",
    abundance: normalise(massToAtom(ci, mass), natural),
  },
];

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "elements.json"), JSON.stringify(elements, null, 2) + "\n");
writeFileSync(join(OUT, "worlds.json"), JSON.stringify(worlds, null, 2) + "\n");

console.log("radius fallbacks:", radiusNotes.join("; "));
console.log("Jmol has no colour (used Jmol Xx #FF1493):", colorNotes.join(","));
console.log("body notes:", body.notes.join("; ") || "none");
console.log("cosmic null:", elements.filter((e) => e.cosmic == null).map((e) => e.symbol).join(","));
for (const w of worlds) console.log(w.id, Object.keys(w.abundance).length, "elements");
