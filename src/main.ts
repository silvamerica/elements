import { Application } from "pixi.js";
import { ELEMENT_INFO } from "./chemistry/elements";
import { Game } from "./game/game";
import { browserStore, clearSave, readSave, writeSave } from "./game/save";
import { Input } from "./input/input";
import { Renderer } from "./render/renderer";
import { Shelf } from "./ui/shelf";
import { newSeed } from "./world/rng";
import { atomTag } from "./world/world";

const SAVE_EVERY_MS = 3000;

function el(id: string): HTMLElement {
	const found = document.getElementById(id);
	if (!found) throw new Error(`missing #${id}`);
	return found;
}

async function main(): Promise<void> {
	const host = el("app");
	const resolution = Math.min(window.devicePixelRatio || 1, 2);
	const app = new Application();
	await app.init({
		resizeTo: window,
		background: "#000000",
		antialias: true,
		autoDensity: true,
		resolution,
	});
	host.appendChild(app.canvas);

	const store = browserStore();
	const size = { width: window.innerWidth, height: window.innerHeight };
	const saved = readSave(store);
	const game =
		(saved && Game.restore(saved, size)) ?? Game.create(newSeed(), size);
	const { world } = game;

	const input = new Input(world, app.canvas, resolution);
	const renderer = new Renderer(app, world, () => input.dragging());

	let resetting = false;
	const save = () => {
		if (!resetting) writeSave(store, game.toSave());
	};
	const shelf = new Shelf(game, el("shelf"), el("toast"), () => {
		resetting = true;
		clearSave(store);
		window.location.reload();
	});
	input.onTap = (entity, body) => {
		if (entity.kind === "atoms") {
			const info = ELEMENT_INFO[atomTag(body).element];
			if (info)
				shelf.say(
					`${info.symbol} · ${info.name}${info.noble ? " (never bonds)" : ""}`,
				);
		} else if (entity.kind === "molecule") {
			shelf.say(`${entity.recipe.label} ${entity.recipe.name}`);
		} else {
			const what = entity.tier ? `${entity.tier.name} of ` : "";
			shelf.say(
				`${what}${entity.members.length} × ${entity.recipe.label} ${entity.recipe.name}`,
			);
		}
	};

	// Dev-only handle for poking at the world from a console or test browser.
	if (import.meta.env.DEV)
		Object.assign(window, { water: world, waterGame: game, waterInput: input });

	window.addEventListener("resize", () =>
		world.resize(window.innerWidth, window.innerHeight),
	);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") save();
	});
	window.addEventListener("pagehide", save);

	let sinceSave = 0;
	app.ticker.add((ticker) => {
		const dt = Math.min(ticker.deltaMS, 100);
		game.tick(dt);
		renderer.draw(dt);
		sinceSave += dt;
		if (sinceSave >= SAVE_EVERY_MS) {
			sinceSave = 0;
			save();
		}
	});
}

void main();
