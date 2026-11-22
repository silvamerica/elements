# Sources: bonds.json

`bonds.json` holds the 2D bond graph of each recipe in `recipes.json`,
keyed by the recipe's `formula` string. Each entry is
`{ cid, atoms, bonds }`: `atoms` are element symbols in PubChem atom
order (hydrogens explicit), `bonds` are `[i, j, order]` with 0-based
indices into `atoms`.

Built by `scripts/build-bonds.mjs`:

    node scripts/build-bonds.mjs --cache <dir>

## Source

PubChem PUG REST (https://pubchem.ncbi.nlm.nih.gov/rest/pug), no key.
Three endpoints:

- `compound/name/<name>/cids/JSON`: name to CIDs
- `compound/fastformula/<Hill formula>/cids/JSON`: exact formula to CIDs
- `compound/cid/<cid>/record/JSON?record_type=2d`: atoms
  (`atoms.aid`, `atoms.element` as atomic number) and bonds
  (`bonds.aid1`, `bonds.aid2`, `bonds.order`)

Requests are spaced 250 ms apart (under PubChem's 5/s limit), with
backoff and retry on 429/5xx. Every response, 404s included, is cached
on disk, so a rerun with the same cache makes no requests.

## Method

For each recipe, the script looks the recipe `name` up first, then two
spelling variants: a trailing " gas" dropped ("Hydrogen gas" becomes
"Hydrogen"), and British spellings changed to PubChem's
(aluminium/aluminum, caesium/cesium). It reads the 2D record of each
returned CID in PubChem's ranking order, up to 10, and keeps the first
whose atom counts exactly equal the recipe's `counts`. Charges, radicals
and isotopes are ignored, so `[Na+].[Cl-]` matches NaCl.

If no name gives a match, the script runs an exact formula search on the
Hill-order formula built from `counts`. It sorts the hits by ascending
CID, checks up to 25 of them, and keeps the lowest CID that matches.

## Result

467 of 470 recipes matched: 427 by name, 40 by formula.

In every name match, the CID PubChem listed first was the one that
matched, so none of the name matches needed a choice between CIDs.

### Missing (3)

| formula | name              | why                                                                                                                                                        |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FrCl    | Francium chloride | Name and formula `ClFr` both return no CID.                                                                                                                |
| RaCl2   | Radium chloride   | Name returns no CID. Formula `Cl2Ra` returns only CID 6365210 ("Radium chloride"), which is a one-Ra, one-Cl record (MolecularFormula `ClRa-`), not RaCl2. |
| CaC2    | Calcium carbide   | Name, "calcium acetylide", CAS 75-20-7 and formula `C2Ca` all return no CID (checked again directly, outside the cache).                                   |

### Bond orders as PubChem encodes them

`order` is copied from PubChem unchanged. PubChem's codes are 1 single,
2 double, 3 triple, 4 quadruple, 5 dative, 6 complex and 7 ionic. The 2D
records store aromatic rings in Kekulé form (alternating 1 and 2), so no
order-4 "aromatic" bonds appear. This dataset uses orders 1 (1006
bonds), 2 (312), 3 (39), 6 (10) and 7 (42).

PubChem is not consistent about ionic compounds. 46 entries join their
ions with an explicit ionic (7) or complex (6) bond: NaCl is a single
Na–Cl bond of order 7, and the same goes for KCl, NaOH and KCN. Many
other salts are stored as separate charged ions with no bond between
them: MgCl2 is three components, Fe2O3 five and Na2SO4 three. Both forms
are kept as PubChem gives them.

### Disconnected entries

161 of the 467 entries have more than one connected component when every
bond counts. If bonds of order 6 and 7 are not counted, 206 do. The
validation script prints the full list. Most are salts, oxides,
sulfides and minerals stored as separate ions, such as `[Fe+3]`,
`[O-2]`, `[Na+]` and sulfate.

## Judgement calls

The 40 formula-fallback picks are the lowest CID whose atom counts match.
These are the oldest deposited records for the formula and usually the
generic one, but they were not otherwise checked to be the intended
mineral or phase:

Fe2O3 14833, P4 123286, NO2Cl 13932711, Na2S 14804, UO2CO3 18364468,
Fe3O4 6432052, FeCr2O4 129627662, Al2SiO5 9942228, LiAlSi2O6 166597,
BeAl2O4 13726050, Cu2CO3(OH)2 25503, CuFeS2 19601290, NiAs 62391,
FeAsS 15787963, NiAsS 173459660, AuTe2 56943357, CaWO4 123264,
FeWO4 22178528, MnO(OH) 5359598, Bi2O3 14776, Ag2O 9794626,
Co3O4 6432046, Tb2O3 159410, Dy2O3 159370, Er2O3 159426,
Yb2O3 159375, IrO2 82821, PoO2 44518933, Rb2O 10154361,
Fe2SiO4 13726185, NiS 28094, Fe3P 138395180, Fe(OH)3 73964,
MnCl2 24480, RuCl3 61850, AcCl3 86218203, YVO4 83578, TiC 4226345,
ZnSe 73979, Bi2Te3 6379155.

Extended solids such as SiO2, Al2O3, BN and SiC are stored as their
formula unit, as PubChem gives them, not as a lattice. Their graphs show
how the atoms in one formula unit are connected, not the bulk structure.
