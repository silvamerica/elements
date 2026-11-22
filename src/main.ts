import { Application } from "pixi.js";
import { equation, REACTIONS } from "./chemistry/reactions";
import { recipeById } from "./chemistry/recipes";
import { Assembler } from "./game/assembler";
import { Game, WORLD_SIZE } from "./game/game";
import { describeMissing, Reactor, speciesOf } from "./game/reactor";
import { browserStore, clearSave, readSave, writeSave } from "./game/save";
import { Selection } from "./game/selection";
import { TabLock, tabChannel } from "./game/tabs";
import { Input } from "./input/input";
import { Camera } from "./render/camera";
import { Renderer } from "./render/renderer";
import { ArmedChip } from "./ui/armed";
import { Hud } from "./ui/hud";
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

	// Only one tab plays (and saves) the world at a time.
	const lock = new TabLock(tabChannel());
	const elsewhere = el("elsewhere");
	const showElsewhere = () => {
		const card = document.createElement("div");
		card.className = "panel";
		const text = document.createElement("div");
		text.textContent = "This world is open in another tab.";
		const take = document.createElement("button");
		take.type = "button";
		take.className = "pill accent";
		take.style.justifySelf = "center";
		take.textContent = "Play it here";
		take.addEventListener("click", async () => {
			await lock.takeOver();
			window.location.reload();
		});
		card.append(text, take);
		elsewhere.replaceChildren(card);
		elsewhere.hidden = false;
	};
	if (!(await lock.claim())) showElsewhere();
	lock.onLost = showElsewhere;

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
	const reactor = new Reactor(world, (e) => input.dragging()?.id === e.id);
	const renderer = new Renderer(
		camera.viewport,
		world,
		() => input.dragging(),
		{
			selected: () => selection.current(),
			guided: (now) => selection.guided(now),
			heat: () => reactor.heatGlow(),
			lit: () => (input.isLit() ? input.dragging() : undefined),
		},
	);

	let resetting = false;
	const save = () => {
		if (!resetting && lock.owned)
			writeSave(store, { ...game.toSave(), camera: camera.view });
	};
	lock.onYield = save;
	const shelf = new Hud(game, el("world"), el("found"), el("toast"), () => {
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
	const tray = new Tray(
		el("tray"),
		world,
		() => game.knownMolecules(),
		() => game.knownReactions(),
		() => armed,
	);
	tray.onBuild = (id) => arm(id);

	// Reactions: a ready reaction beats bonding; a near-miss gives a hint.
	input.onDrop = (held, target, sparked) => {
		const result = reactor.drop(held, target, sparked);
		const seen = (id: string) => game.knownReactions().has(id);
		switch (result.kind) {
			case "reacted":
				shelf.say(`${result.reaction.name}: ${equation(result.reaction)}`);
				return true;
			case "needs-heat":
				world.bounce(held, target);
				shelf.say(
					seen(result.reaction.id)
						? `${result.reaction.name} needs a spark: swing it fast, then let go on its partner`
						: "Something wants to happen here: swing it fast for a spark",
				);
				return true;
			case "incomplete": {
				const bond = world.predict(held, target).outcome;
				if (bond === "snap" || bond === "join") return false;
				world.bounce(held, target);
				const what = seen(result.reaction.id)
					? result.reaction.name
					: "Something";
				shelf.say(
					`${what} could happen with ${describeMissing(result.missing)} nearby`,
				);
				return true;
			}
			default:
				return false;
		}
	};
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
			waterReactor: reactor,
		});

	window.addEventListener("resize", () =>
		camera.resize(window.innerWidth, window.innerHeight),
	);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") save();
	});
	window.addEventListener("pagehide", save);

	// Say so the moment a held thing lights up, if it has anything to light.
	let wasLit = false;
	const needsSpark = (e: Entity | undefined) => {
		const s = e && speciesOf(e);
		return !!s && REACTIONS.some((r) => r.needsHeat && s in r.reactants);
	};

	let sinceSave = 0;
	app.ticker.add((ticker) => {
		const dt = Math.min(ticker.deltaMS, 100);
		if (!lock.owned) return;
		const lit = input.isLit();
		if (lit && !wasLit && needsSpark(input.dragging()))
			shelf.say("Lit: let go on its partner");
		wasLit = lit;
		input.sync();
		game.tick(dt);
		assembler.update(dt);
		reactor.update(dt);
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
