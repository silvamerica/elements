import type { Recipe } from "../chemistry/recipes";

/** The "Assembling NaCl ✕" chip shown while a molecule is armed for building. */
export class ArmedChip {
	onClear: () => void = () => {};
	private readonly label: HTMLElement;

	constructor(private readonly root: HTMLElement) {
		this.label = document.createElement("span");
		const close = document.createElement("button");
		close.type = "button";
		close.textContent = "✕";
		close.setAttribute("aria-label", "Stop building");
		close.addEventListener("click", () => this.onClear());
		root.append(this.label, close);
		root.hidden = true;
	}

	show(recipe: Recipe | undefined): void {
		this.root.hidden = !recipe;
		if (recipe)
			this.label.textContent = `Assembling ${recipe.label} ${recipe.name}`;
	}
}
