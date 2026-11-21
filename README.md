# Water

A zen chemistry sandbox. Atoms drift in on a black canvas; drag one onto
another to bond them. Exact recipes snap into molecules (H + H → H₂, then
H₂ + O → H₂O), partial ones hang together loosely until they're complete,
and impossible ones bounce apart. Drag molecules onto their own kind to
grow named structures (three waters make a Droplet, then a Puddle, then an
Ice crystal). Double-tap to take a step back.

## Running

    npm install
    lab dev          # or: npm run dev
    npm test
    npm run deploy   # Cloudflare Pages project "water"

## Where things live

`src/chemistry/` is pure data and rules: elements, the recipe table, the
structure tier ladders, molecule layouts, and `resolveAtoms`. Adding a
molecule is a row in `recipes.ts` (plus an optional shape in `layouts.ts`
and ladder in `structures.ts`). `src/world/` wraps Matter.js and emits
events; `src/input/` turns drags and double-taps into world calls;
`src/render/` draws with PixiJS; `src/modes/` holds ways to play, of
which `zen` is the first.
