import type { Recipe } from "../chemistry/recipes";

/** The "Assembling NaCl · Stop" pill shown while a molecule is armed for building. */
export class ArmedChip {
	onClear: () => void = () => {};
	private readonly label: HTMLElement;

	constructor(private readonly root: HTMLElement) {
		const dot = document.createElement("span");
		dot.className = "dot";
		this.label = document.createElement("span");
		const close = document.createElement("button");
		close.type = "button";
		close.className = "stop";
		close.textContent = "Stop";
		close.addEventListener("click", () => this.onClear());
		root.append(dot, this.label, close);
		root.hidden = true;
	}

	show(recipe: Recipe | undefined): void {
		this.root.hidden = !recipe;
		if (recipe)
			this.label.textContent = `Assembling ${recipe.label} ${recipe.name}`;
	}
}
