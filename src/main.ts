import { Application } from "pixi.js";
import { recipeById } from "./chemistry/recipes";
import { Assembler } from "./game/assembler";
import { Game, WORLD_SIZE } from "./game/game";
import { browserStore, clearSave, readSave, writeSave } from "./game/save";
import { Selection } from "./game/selection";
import { Input } from "./input/input";
import { Camera } from "./render/camera";
import { Renderer } from "./render/renderer";
import { ArmedChip } from "./ui/armed";
import { Shelf } from "./ui/shelf";
import { Tray } from "./ui/tray";
import type { Point } from "./world/events";
import { newSeed } from "./world/rng";
import type { Entity } from "./world/world";

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
	game.mode.view = () => camera.visibleRect;
	const input = new Input(world, camera, app.canvas, resolution);
	const selection = new Selection(world);
	const renderer = new Renderer(
		camera.viewport,
		world,
		() => input.dragging(),
		{
			selected: () => selection.current(),
			guided: (now) => selection.guided(now),
		},
	);

	let resetting = false;
	const save = () => {
		if (!resetting) writeSave(store, { ...game.toSave(), camera: camera.view });
	};
	const shelf = new Shelf(game, el("shelf"), el("toast"), () => {
		resetting = true;
		clearSave(store);
		window.location.reload();
	});
	// Assembly: a known molecule can be armed, then built by tapping.
	const assembler = new Assembler(world, (e) => input.dragging()?.id === e.id);
	const armedChip = new ArmedChip(el("armed"));
	let armed: string | undefined;
	const arm = (id: string | undefined) => {
		armed = id;
		armedChip.show(id ? recipeById(id) : undefined);
		if (id) shelf.say(`Tap where to build ${recipeById(id).label}`);
	};
	armedChip.onClear = () => arm(undefined);
	shelf.onArm = (id) => arm(armed === id ? undefined : id);
	const build = (at: Point, onto?: Entity) => {
		if (!armed) return;
		const plan = assembler.place(armed, at, onto);
		if (!plan.ok) {
			const need = Object.entries(plan.short)
				.filter(([, n]) => (n ?? 0) > 0)
				.map(([e, n]) => `${n} ${e}`);
			shelf.say(`Needs ${need.join(", ")} more — not on the board yet`);
		}
	};

	// Tap or grab selects; the tray says what the selection could become.
	input.onTap = (entity, body) => {
		if (armed && assembler.relates(armed, entity))
			build({ ...body.position }, entity);
		else selection.select(entity);
	};
	input.onGrab = (entity) => selection.select(entity);
	input.onTapEmpty = (at) => {
		if (armed) build(at);
		else selection.clear();
	};
	const tray = new Tray(el("tray"), world, () => game.knownMolecules());
	tray.onPick = (c) => {
		const short = selection.guideTo(c.missing, performance.now());
		const missing = Object.entries(short).map(([e, n]) => `${n} ${e}`);
		if (c.known) {
			arm(c.recipe.id);
			shelf.say(`Tap your partial (or anywhere) to build ${c.recipe.label}`);
		} else if (missing.length)
			shelf.say(`None on the board yet: ${missing.join(", ")}`);
	};

	// Dev-only handle for poking at the world from a console or test browser.
	if (import.meta.env.DEV)
		Object.assign(window, {
			water: world,
			waterGame: game,
			waterInput: input,
			waterCamera: camera,
			waterSelection: selection,
			waterAssembler: assembler,
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
		assembler.update(dt);
		renderer.draw(dt);
		tray.show(input.dragging() ?? selection.current());
		sinceSave += dt;
		if (sinceSave >= SAVE_EVERY_MS) {
			sinceSave = 0;
			save();
		}
	});
}

void main();
