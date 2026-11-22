# Water

A zen chemistry sandbox. Atoms drift in on a black canvas; drag one onto
another to bond them. Exact recipes snap into molecules (H + H → H₂, then
H₂ + O → H₂O), partial ones hang together loosely for a while, and
impossible ones bounce apart. Drag molecules onto their own kind to grow
named structures (three waters make a Droplet, salt grows into a Salt
crystal). Tap anything to learn its name; double-tap to take a step back.
Tapping something selects it, and the tray along the bottom lists what
it could still become (unmade molecules stay "???") and what it can react
with. Molecules you've already made can be built on demand: tap one in
the shelf or tray, then tap where it should go, and the nearest pieces
fly in; tapping beside its own kind grows a structure. Real reactions
happen when everything they need is close by: drop methane on oxygen
with a second oxygen nearby and fling it for a spark, and it burns,
leaving heat that can set off the next fire.
The world is bigger than the screen: drag empty space to pan, pinch or
scroll to zoom, and double-tap empty space to see all of it.

Every element in the periodic table exists. Each browser gets its own
world, picked by a random seed: an ocean, a stretch of crust, an
atmosphere, a living cell, a gas giant or a meteorite. Atoms spawn at
that environment's real natural abundances, squashed on a log scale so
rare elements still turn up now and then, with a small share of strays
from the rest of the natural table. The world saves itself in the browser
and carries on when you come back; Reset in the corner starts a new one.

## Running

    npm install
    lab dev          # or: npm run dev
    npm test
    npm run deploy   # Cloudflare Pages project "water"

## Where things live

`src/chemistry/` is pure data and rules. `data/elements.json`,
`data/worlds.json` and `data/recipes.json` are generated from published
sources (see the `sources-*.md` notes beside them); `resolveAtoms` decides
what a bag of atoms becomes, `structures.ts` holds the tier ladders and
`layouts.ts` gives molecules their shapes. `src/world/` wraps Matter.js
and emits events; `src/game/` holds the seed, the chosen world, saving
and discoveries; `src/input/` turns drags and taps into world calls;
`src/render/` draws with PixiJS; `src/modes/` holds ways to play, of
which `zen` is the first. Parked ideas are in `BACKLOG.md`.
