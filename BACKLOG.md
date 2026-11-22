# Backlog

Ideas parked for later rounds, roughly in the order they'd be fun.

## Radioactive decay

Unstable elements (U, Th, Ra, Rn, Po, K-40 and friends) decay on their own
clock, turning into their daughter element with a small flash. Half-lives
would be compressed onto a playable scale but keep their order, so radon
pops quickly while uranium almost never does. This is also the natural way
for elements that never spawn (Tc, Pm, the heavy synthetics) to appear:
only as decay products, a reward for watching long enough.

## Isomers

Recipes are matched by atom counts alone, so each formula has one name
(C₂H₆O is ethanol, never dimethyl ether). Isomers would let the same atoms
make different molecules depending on how they were bonded: which atom you
dropped onto which. That needs bond topology tracked through loose
clusters, and a recipe table keyed by structure rather than formula.

## Other modes

Overflow pressure (atoms spawn faster; too many on screen and you lose),
timed score attack, and puzzle levels with a fixed set of atoms and a
target. Each is a `Mode` on the same engine.

## Screensaver

A watch-only autoplay mode that bonds atoms by itself, wrapped as a macOS
`.saver` that loads the web build in a WebKit view.
