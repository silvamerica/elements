import type { Discovery, Game } from "../game/game";

/**
 * The corner card: which world this is, progress through the recipe book,
 * and (tap to open) everything discovered so far. Plus a quiet Reset.
 */
export class Shelf {
	private toastTimer: number | undefined;
	/** Called when a discovered molecule's row is tapped. */
	onArm: (recipeId: string) => void = () => {};
	private open = false;

	constructor(
		private readonly game: Game,
		private readonly root: HTMLElement,
		private readonly toast: HTMLElement,
		onReset: () => void,
	) {
		root.innerHTML = `
			<div class="world"></div>
			<button class="count" type="button"></button>
			<div class="list" hidden></div>
			<button class="reset" type="button">Reset world</button>`;
		this.q(".world").textContent =
			`${game.kind.name} world · ${game.seedLabel}`;
		this.q(".world").title = game.kind.blurb;
		this.q(".count").addEventListener("click", () => this.toggle());
		this.q(".reset").addEventListener("click", () => {
			if (window.confirm("Start a brand-new world? This one will be gone."))
				onReset();
		});
		for (const d of game.discoveries()) this.addRow(d, false);
		this.updateCount();
		game.onDiscover((d) => {
			this.addRow(d, true);
			this.updateCount();
			this.show(`Discovered: ${d.text}`);
		});
	}

	private q(sel: string): HTMLElement {
		const el = this.root.querySelector<HTMLElement>(sel);
		if (!el) throw new Error(`shelf missing ${sel}`);
		return el;
	}

	private toggle(): void {
		this.open = !this.open;
		this.q(".list").hidden = !this.open;
		this.updateCount();
	}

	private updateCount(): void {
		const reactions = this.game.knownReactions().size;
		const structures =
			this.game.discoveries().length - this.game.moleculesFound() - reactions;
		const arrow = this.open ? "▾" : "▸";
		this.q(".count").textContent =
			`${arrow} ${this.game.moleculesFound()} / ${this.game.moleculeTotal} molecules` +
			` · ${reactions} / ${this.game.reactionTotal} reactions` +
			(structures ? ` · ${structures} structures` : "");
	}

	private addRow(d: Discovery, fresh: boolean): void {
		const molecule = d.key.startsWith("m:") ? d.key.slice(2) : undefined;
		const row = document.createElement(molecule ? "button" : "div");
		row.textContent = d.text;
		if (molecule) {
			(row as HTMLButtonElement).type = "button";
			row.title = "Tap to build this";
			row.addEventListener("click", () => this.onArm(molecule));
		}
		const list = this.q(".list");
		list.prepend(row);
		if (fresh) {
			row.className = "new";
			setTimeout(() => row.classList.remove("new"), 50);
		}
	}

	/** A short line at the bottom of the screen. */
	say(text: string): void {
		this.show(text);
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
