import type { Discovery, Game } from "../game/game";

/**
 * The fixed screen furniture: the world card (top left), the discoveries
 * panel (top right: counts, an openable list where made molecules can be
 * built, and Reset), and the message pill above the tray.
 */
export class Hud {
	/** Called when a discovered molecule's "build" is tapped. */
	onArm: (recipeId: string) => void = () => {};
	private open = false;
	private toastTimer: number | undefined;
	private readonly counts = document.createElement("button");
	private readonly list = document.createElement("div");
	private readonly foot = document.createElement("div");

	constructor(
		private readonly game: Game,
		worldEl: HTMLElement,
		found: HTMLElement,
		private readonly toast: HTMLElement,
		onReset: () => void,
	) {
		const name = document.createElement("b");
		name.textContent = `${game.kind.name} world`;
		const seed = document.createElement("span");
		seed.className = "seed";
		seed.textContent = game.seedLabel;
		worldEl.replaceChildren(name, seed);
		worldEl.title = game.kind.blurb;

		const label = document.createElement("div");
		label.className = "label";
		label.textContent = "Discoveries";
		this.counts.type = "button";
		this.counts.className = "counts";
		this.counts.addEventListener("click", () => this.toggle());
		this.list.className = "list";
		this.foot.className = "foot";
		const collapse = button("Collapse", () => this.toggle());
		const reset = button("Reset world", () => {
			if (window.confirm("Start a brand-new world? This one will be gone."))
				onReset();
		});
		this.foot.append(collapse, reset);
		found.replaceChildren(label, this.counts, this.list, this.foot);

		for (const d of game.discoveries()) this.addRow(d, false);
		game.onDiscover((d) => {
			this.addRow(d, true);
			this.updateCounts();
			this.say(`Discovered: ${d.text}`);
		});
		this.updateCounts();
		this.setOpen(false);
	}

	/** A short message in the pill above the tray. */
	say(text: string): void {
		this.toast.textContent = text;
		this.toast.classList.add("show");
		clearTimeout(this.toastTimer);
		this.toastTimer = window.setTimeout(
			() => this.toast.classList.remove("show"),
			2400,
		);
	}

	private toggle(): void {
		this.setOpen(!this.open);
	}

	private setOpen(open: boolean): void {
		this.open = open;
		this.list.hidden = !open;
		this.foot.hidden = !open;
	}

	private updateCounts(): void {
		const molecules = this.game.moleculesFound();
		const reactions = this.game.knownReactions().size;
		const structures = this.game.discoveries().length - molecules - reactions;
		this.counts.replaceChildren(
			count(molecules, `/${this.game.moleculeTotal} molecules`),
			count(reactions, `/${this.game.reactionTotal} reactions`, "reactions"),
			count(structures, "structures", "structures"),
		);
	}

	private addRow(d: Discovery, fresh: boolean): void {
		const molecule = d.key.startsWith("m:") ? d.key.slice(2) : undefined;
		const row = document.createElement(molecule ? "button" : "div");
		row.className = "row";
		const text = document.createElement("span");
		text.textContent = d.text;
		row.append(text);
		if (molecule) {
			(row as HTMLButtonElement).type = "button";
			const build = document.createElement("span");
			build.className = "build";
			build.textContent = "build";
			row.append(build);
			row.addEventListener("click", () => this.onArm(molecule));
		}
		if (fresh) {
			row.classList.add("new");
			setTimeout(() => row.classList.remove("new"), 2000);
		}
		this.list.prepend(row);
	}
}

function button(text: string, onClick: () => void): HTMLButtonElement {
	const b = document.createElement("button");
	b.type = "button";
	b.textContent = text;
	b.addEventListener("click", onClick);
	return b;
}

function count(n: number, label: string, cls?: string): HTMLElement {
	const el = document.createElement("span");
	if (cls) el.className = cls;
	const b = document.createElement("b");
	b.textContent = String(n);
	const s = document.createElement("span");
	s.textContent = label;
	el.append(b, s);
	return el;
}
