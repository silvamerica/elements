# Recipe data sources

`recipes.json` holds **470** compound recipes. `scripts/build-recipes.mjs`
regenerates it (`node scripts/build-recipes.mjs`). Each recipe is
`{ formula, name, counts }`, and `counts` gives the total number of atoms of
each element in one formula unit.

## Sources

1. **Wikipedia, "Glossary of chemical formulae".** The old title,
   "Dictionary of chemical formulas", now redirects here. The script reads
   the raw wikitext through the MediaWiki API
   (`action=parse&page=Glossary_of_chemical_formulae&prop=wikitext`). The
   page holds one sortable table per letter, with columns for formula,
   synonyms and CAS number, and all sub-sections (A to Z, plus Ca–Cu) live
   on this one page.
2. **Wikipedia, "List of inorganic compounds".** Raw wikitext from the same
   API. Each bullet has the form `[[Name]] – {{chem2|formula}}`.
3. **PubChem PUG REST** (`/rest/pug/compound/cid/<CID>/property/MolecularFormula,Title/JSON`).
   This covers 12 entries that neither Wikipedia list has in a form the
   parser accepts. Each one is checked by CID, and the script requires
   PubChem's `MolecularFormula` to match the recipe's counts:

   | Formula    | Name                        | CID      | PubChem title                   |
   | ---------- | --------------------------- | -------- | ------------------------------- |
   | P4         | White phosphorus            | 123286   | Tetraphosphorus                 |
   | S8         | Octasulfur                  | 66348    | Cyclooctasulfur                 |
   | ClONO2     | Chlorine nitrate            | 114934   | Nitryl hypochlorite             |
   | CH3Br      | Bromomethane                | 6323     | Methyl bromide                  |
   | CaMg(CO3)2 | Calcium magnesium carbonate | 61833    | Dolomite                        |
   | Be2SiO4    | Beryllium silicate          | 27131    | Beryllium silicate (phenakite)  |
   | As2S3      | Arsenic trisulfide          | 71586773 | Arsenic trisulfide (orpiment)   |
   | AlO(OH)    | Aluminium oxide hydroxide   | 73982    | Boehmite                        |
   | CePO4      | Cerium(III) phosphate       | 159673   | Cerium phosphate (monazite)     |
   | Nb2O5      | Niobium pentoxide           | 9903420  | Niobium pentoxide               |
   | Lu2O3      | Lutetium(III) oxide         | 4323797  | Lutetium oxide                  |
   | CrN        | Chromium nitride            | 90362    | Chromium nitride (carlsbergite) |

Every other entry (458) matches at least one row of source 1 or source 2
whose formula parses to the same atom counts. The build stops with an error
if any curated line has no matching source row, so no entry rests on memory
alone. `node scripts/build-recipes.mjs --sources` prints each entry next to
the source row it matched.

## How the candidate pool was filtered

The parser removes `{{chem2}}` templates, `<sub>` tags, wiki links and
references. It expands parentheses and brackets such as `Ca(NO3)2`,
`H2[PtCl6]` and `(CN)2`, and it rejects any formula that is not a plain
neutral formula:

- **Hydrates and adducts:** anything containing `*`, `·` or `.`.
- **Ions:** any charge sign (`+`, `-`, `−`).
- **Phase markers:** `(aq)`, `(s)`, `(l)`, `(g)`.
- **Unknown symbols:** any symbol that is not a real element (`R`, `Me`,
  `Ph`, `D`, and so on).

It then keeps only formulas with **2 to 10 atoms in total**, built only
from **Z 1–92 excluding Tc, Pm, He, Ne, Ar, Kr, Xe and Rn**. After this step
the pool holds 2,084 distinct atom-count multisets
(`node scripts/build-recipes.mjs --pool`).

The 470 entries were picked from that pool by hand, in priority order:

| Group                                                                            | Entries |
| -------------------------------------------------------------------------------- | ------- |
| Core molecules (the 13 required)                                                 | 13      |
| Other elemental molecules (F2, Cl2, Br2, I2, P4, S8)                             | 6       |
| Atmosphere: gases, acids, CFCs, trace species                                    | 45      |
| Small organics and biomolecules (cell, meteorite organics)                       | 53      |
| Gas giant: hydrides and cloud-deck species (PH3, NH4SH, GeH4, AsH3, ...)         | 14      |
| Seawater salts, brines, evaporites and dissolved acids                           | 54      |
| Crust: oxides and minerals, written with chemical names                          | 129     |
| Meteorite (CI chondrite) phases: olivines, troilite, spinel, SiC, TiN, Fe3P, ... | 15      |
| Halides across the periodic table                                                | 76      |
| Other common salts, hydrides, carbides, nitrides, borides                        | 48      |
| Semiconductor chalcogenides and pnictides (ZnSe, GaAs, InP, ...)                 | 17      |

Once the world-relevant groups were in place, the remaining picks were made
so that every allowed element appears at least once, favouring each
element's best-known oxide or chloride. The first draft had 696 entries and
was cut to 470. The cuts removed redundant long-tail rows: lanthanide
chlorides (their oxides were kept), extra interhalogens and fluorides,
nitrates and sulfates of minor metals, and rare chalcogenides and
pnictides.

## Isomer ties (one entry per atom-count multiset)

The script rejects two curated lines with the same counts. Where the pool
listed several compounds for one multiset, the best-known compound was kept:

| Counts | Kept              | Dropped              |
| ------ | ----------------- | -------------------- |
| C2H6O  | Ethanol           | Dimethyl ether       |
| C2H4O  | Acetaldehyde      | Ethylene oxide       |
| CH3NO  | Formamide         | Oxaziridine          |
| CHNO   | Isocyanic acid    | Fulminic acid        |
| C2H7N  | Dimethylamine     | Ethylamine           |
| C3H4   | Propyne           | Propadiene           |
| C3H6   | Propylene         | Cyclopropane         |
| C3H3N  | Acrylonitrile     | Azete                |
| CH4O2  | Methanediol       | Methyl hydroperoxide |
| KCNO   | Potassium cyanate | Potassium fulminate  |
## Naming

Names are the common chemical names, with the first letter capitalized.
Minerals take their chemical name rather than the mineral name: SiO2 is
"Silicon dioxide", Mg2SiO4 is "Magnesium orthosilicate" (forsterite),
FeTiO3 is "Iron(II) titanate" (ilmenite) and FeS2 is "Iron disulfide"
(pyrite). A few very familiar molecules keep their everyday names: Water,
Ammonia, Methane, Ozone, Hydrogen gas, Nitrogen gas, Oxygen. IUPAC "-ium"
spellings follow the Wikipedia sources ("Aluminium", "Caesium").

## Element coverage

All 84 allowed elements appear in at least one recipe. No allowed natural
element is missing.

Francium (FrCl, Francium chloride) and astatine (HAt, Hydrogen astatide)
are covered only through compounds that the Wikipedia lists include but
that have been studied only at trace or tracer scale. Polonium (PoO2),
actinium (Ac2O3, AcCl3), protactinium (PaCl5) and radium (RaCl2) are real
compounds of intensely radioactive elements.

## Judgement calls

- **Radicals:** none are included except NO, NO2 and ClO2, as the task
  allowed. ClO, NO3, CH3, FO and similar species in the pool were skipped.
- **NH4SH (Ammonium hydrosulfide)** is included as the neutral salt that
  forms Jupiter's middle cloud deck.
- **Ammonium salts** (NH4Cl, NH4NO3, NH4HCO3, HCOONH4) count as neutral
  formula units. NH4OH ("ammonium hydroxide") was skipped because it is
  aqueous ammonia, not a discrete compound.
- **Dimers written as monomers:** Al2Cl6, Au2Cl6 and similar dimers appear
  as their conventional monomer formulas (AlCl3, AuCl3), which Wikipedia
  also lists.
- **Pool rows that looked wrong were not used**, for example
  "Ammonium hexafluorophosphate = F6H4", "Cd:Cl5 = Trigonal bipyramidal",
  "Co2SO4 = cobalt(II) sulfate", "NaSeO3", "CsSeO4", "Ni(CO)3 = nickel
  carbonate", "F5S = disulfur decafluoride" and "Pb2 = diplumbyne".
- **Wrong PubChem records were dropped.** The PubChem records for lithium
  nitride (H2Li3N+2) and potassium superoxide (KO2+) do not match the
  neutral formulas, and cementite (Fe3C) is recorded as CH4Fe3. Li3N, KO2,
  Fe3C and Mg3N2 (no PubChem hit) were therefore left out.
- **Disulfuric acid** (H2S2O7) passed PubChem verification but was cut for
  size along with other long-tail entries.
