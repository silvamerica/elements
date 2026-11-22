import { Application } from "pixi.js";
import { ELEMENT_INFO } from "./chemistry/elements";
import { Game, WORLD_SIZE } from "./game/game";
import { browserStore, clearSave, readSave, writeSave } from "./game/save";
import { Input } from "./input/input";
import { Camera } from "./render/camera";
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
	const saved = readSave(store);
	const game =
		(saved && Game.restore(saved, WORLD_SIZE)) ??
		Game.create(newSeed(), WORLD_SIZE);
	const { world } = game;

	const camera = new Camera(app, WORLD_SIZE.width, WORLD_SIZE.height);
	if (saved?.camera) camera.view = saved.camera;
	const input = new Input(world, camera, app.canvas, resolution);
	const renderer = new Renderer(camera.viewport, world, () => input.dragging());

	let resetting = false;
	const save = () => {
		if (!resetting) writeSave(store, { ...game.toSave(), camera: camera.view });
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
		Object.assign(window, {
			water: world,
			waterGame: game,
			waterInput: input,
			waterCamera: camera,
		});

	window.addEventListener("resize", () =>
		camera.resize(window.innerWidth, window.innerHeight),
	);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") save();
	});
	window.addEventListener("pagehide", save);

	let sinceSave = 0;
	app.ticker.add((ticker) => {
		const dt = Math.min(ticker.deltaMS, 100);
		input.sync();
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
