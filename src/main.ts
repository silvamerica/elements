import { Application } from "pixi.js";
import { Input } from "./input/input";
import type { Mode } from "./modes/mode";
import { ZenMode } from "./modes/zen";
import { Renderer } from "./render/renderer";
import { Shelf } from "./ui/shelf";
import { World } from "./world/world";

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

	const world = new World({
		width: window.innerWidth,
		height: window.innerHeight,
	});
	const input = new Input(world, app.canvas, resolution);
	const renderer = new Renderer(app, world, () => input.dragging());
	new Shelf(world, el("shelf"), el("toast"));

	// Dev-only handle for poking at the world from a console or test browser.
	if (import.meta.env.DEV)
		Object.assign(window, { water: world, waterInput: input });

	const mode: Mode = new ZenMode();
	mode.start(world);

	window.addEventListener("resize", () =>
		world.resize(window.innerWidth, window.innerHeight),
	);

	app.ticker.add((ticker) => {
		const dt = Math.min(ticker.deltaMS, 100);
		world.step(dt);
		mode.update(dt);
		renderer.draw(dt);
	});
}

void main();
