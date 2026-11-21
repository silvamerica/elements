import type { World } from "../world/world";

/** The quiet collection in the corner: each molecule and structure you've made, once. */
export class Shelf {
	private readonly found = new Set<string>();
	private toastTimer: number | undefined;

	constructor(
		world: World,
		private readonly list: HTMLElement,
		private readonly toast: HTMLElement,
	) {
		world.events.on("snapped", ({ recipe }) =>
			this.add(`m:${recipe.id}`, `${recipe.label} ${recipe.name}`),
		);
		world.events.on("tierUp", ({ recipe, tier }) =>
			this.add(
				`s:${recipe.id}:${tier.name}`,
				`${tier.name} of ${recipe.label}`,
			),
		);
	}

	private add(key: string, text: string): void {
		if (this.found.has(key)) return;
		this.found.add(key);
		const row = document.createElement("div");
		row.textContent = text;
		row.className = "new";
		this.list.appendChild(row);
		setTimeout(() => row.classList.remove("new"), 50);
		this.show(`Discovered: ${text}`);
	}

	private show(text: string): void {
		this.toast.textContent = text;
		this.toast.classList.add("show");
		clearTimeout(this.toastTimer);
		this.toastTimer = window.setTimeout(
			() => this.toast.classList.remove("show"),
			2200,
		);
	}
}
