import {
	type Candidate,
	candidatesFor,
	missingList,
	nextTier,
} from "../chemistry/candidates";
import {
	type Counts,
	ELEMENT_INFO,
	formulaKey,
	subscript,
} from "../chemistry/elements";
import type { Entity, World } from "../world/world";

const SHOWN = 8;

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * The "could become" strip along the bottom: for whatever is selected or
 * held, what it is, how close it is to its next structure tier, and the
 * molecules it could still grow into (unknown ones unnamed), each with the
 * atoms it still needs. Tapping an entry hands it to `onPick`.
 */
export class Tray {
	private subject = "";
	onPick: (c: Candidate, from: Entity) => void = () => {};

	constructor(
		private readonly root: HTMLElement,
		private readonly world: World,
		private readonly known: () => ReadonlySet<string>,
	) {}

	/** Redraw if what's in hand (or what's known) has changed. Cheap to call every frame. */
	show(e: Entity | undefined): void {
		const key = e
			? `${e.id}:${formulaKey(this.world.countsOf(e))}:${this.known().size}`
			: "";
		if (key === this.subject) return;
		this.subject = key;
		this.root.replaceChildren();
		this.root.hidden = !e;
		if (!e) return;

		const counts = this.world.countsOf(e);
		this.root.append(this.header(e, counts));

		if (e.kind !== "atoms") {
			const count = e.kind === "structure" ? e.members.length : 1;
			const tier = nextTier(e.recipe.id, count);
			if (tier)
				this.root.append(
					div("tier", `${tier.name}: ${tier.more} more ${e.recipe.label}`),
				);
			if (e.kind === "structure") return;
		}

		const list = candidatesFor(counts, this.known());
		if (list.length === 0) {
			const noble = Object.keys(counts).some((el) => ELEMENT_INFO[el]?.noble);
			this.root.append(
				div("none", noble ? "Never bonds" : "Nothing more to make from this"),
			);
			return;
		}
		const row = div("entries", "");
		for (const c of list.slice(0, SHOWN)) row.append(this.entry(c, e));
		if (list.length > SHOWN)
			row.append(div("more", `+${list.length - SHOWN} more`));
		this.root.append(row);
	}

	private header(e: Entity, counts: Counts): HTMLElement {
		if (e.kind === "molecule")
			return div("head", `${e.recipe.label} ${e.recipe.name}`);
		if (e.kind === "structure")
			return div(
				"head",
				`${e.tier ? `${e.tier.name} of ` : ""}${e.members.length} × ${e.recipe.label}`,
			);
		const els = Object.keys(counts);
		if (els.length === 1 && counts[els[0] as string] === 1) {
			const info = ELEMENT_INFO[els[0] as string];
			return div(
				"head",
				info ? `${info.symbol} · ${info.name}` : (els[0] as string),
			);
		}
		return div("head", `${subscript(formulaKey(counts))} · unfinished`);
	}

	private entry(c: Candidate, from: Entity): HTMLElement {
		const b = document.createElement("button");
		b.type = "button";
		b.className = c.known ? "entry known" : "entry";
		const name = document.createElement("span");
		name.className = "name";
		name.textContent = c.known ? `${c.recipe.label} ${c.recipe.name}` : "???";
		b.append(name);
		for (const [el, n] of missingList(c.missing)) {
			const chip = document.createElement("span");
			chip.className = "chip";
			const info = ELEMENT_INFO[el];
			chip.style.background = info ? hex(info.color) : "#888";
			chip.style.color = info && luminance(info.color) > 0.6 ? "#111" : "#fff";
			chip.textContent = `+${n} ${el}`;
			b.append(chip);
		}
		b.addEventListener("click", () => this.onPick(c, from));
		return b;
	}
}

function div(cls: string, text: string): HTMLElement {
	const d = document.createElement("div");
	d.className = cls;
	d.textContent = text;
	return d;
}

function luminance(color: number): number {
	return (
		(0.2126 * ((color >> 16) & 255) +
			0.7152 * ((color >> 8) & 255) +
			0.0722 * (color & 255)) /
		255
	);
}
