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
import { speciesLabel } from "../chemistry/reactions";
import { Reactor, speciesOf } from "../game/reactor";
import type { Entity, World } from "../world/world";

const SHOWN = 8;
const REACTIONS_SHOWN = 4;

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * The panel along the bottom, for whatever is selected or held: what it is
 * and how far its next structure tier is (with "Build more" for molecules),
 * what it reacts with, and the molecules it could still grow into, each
 * with the atoms it lacks. Unmade molecules and unseen reactions stay "???".
 */
export class Tray {
	private subject = "";
	/** A "could become" entry was tapped. */
	onPick: (c: Candidate, from: Entity) => void = () => {};
	/** "Build more" was tapped for this recipe. */
	onBuild: (recipeId: string) => void = () => {};

	constructor(
		private readonly root: HTMLElement,
		private readonly world: World,
		private readonly known: () => ReadonlySet<string>,
		private readonly knownReactions: () => ReadonlySet<string> = () =>
			new Set(),
		private readonly armed: () => string | undefined = () => undefined,
	) {}

	/** Redraw if what's in hand (or what's known, or what's armed) changed. Cheap to call every frame. */
	show(e: Entity | undefined): void {
		const key = e
			? `${e.id}:${formulaKey(this.world.countsOf(e))}:${this.known().size}:${this.knownReactions().size}:${this.armed() ?? ""}`
			: "";
		if (key === this.subject) return;
		this.subject = key;
		this.root.replaceChildren();
		this.root.hidden = !e;
		if (!e) return;

		const counts = this.world.countsOf(e);
		this.root.append(this.header(e, counts));
		this.reactions(e);
		if (e.kind !== "structure") this.candidates(e, counts);
	}

	private header(e: Entity, counts: Counts): HTMLElement {
		const head = div("head");
		const name = document.createElement("b");
		const sub = span("sub", "");
		if (e.kind === "atoms") {
			const els = Object.keys(counts);
			const info =
				els.length === 1 && counts[els[0] as string] === 1
					? ELEMENT_INFO[els[0] as string]
					: undefined;
			name.textContent = info
				? `${info.symbol} · ${info.name}`
				: subscript(formulaKey(counts));
			sub.textContent = info ? (info.noble ? "Never bonds" : "") : "Unfinished";
			head.append(name, sub);
			return head;
		}
		const count = e.kind === "structure" ? e.members.length : 1;
		name.textContent =
			e.kind === "structure"
				? `${e.tier ? `${e.tier.name} of ` : ""}${count} × ${e.recipe.label}`
				: `${e.recipe.label} ${e.recipe.name}`;
		const tier = nextTier(e.recipe.id, count);
		sub.textContent = tier
			? `${tier.name}: ${tier.more} more ${e.recipe.label}`
			: "";
		head.append(name, sub);
		if (this.known().has(e.recipe.id)) {
			const armed = this.armed() === e.recipe.id;
			const build = document.createElement("button");
			build.type = "button";
			build.className = "pill accent";
			build.textContent = armed
				? `Building ${e.recipe.label}: tap beside it`
				: `Build more ${e.recipe.label}`;
			build.disabled = armed;
			const id = e.recipe.id;
			build.addEventListener("click", () => this.onBuild(id));
			head.append(build);
		}
		return head;
	}

	/** What this can react with: named once seen, otherwise just the partners as a clue. */
	private reactions(e: Entity): void {
		const s = speciesOf(e);
		if (!s) return;
		const list = Reactor.involving(s);
		if (list.length === 0) return;
		const known = this.knownReactions();
		const row = div("row");
		for (const r of list.slice(0, REACTIONS_SHOWN)) {
			const partners = { ...r.reactants };
			if (partners[s]) partners[s] -= 1;
			const withText = Object.entries(partners)
				.filter(([, n]) => n > 0)
				.map(([p, n]) => `${n > 1 ? `${n} ` : ""}${speciesLabel(p)}`)
				.join(" + ");
			const entry = span(known.has(r.id) ? "entry known" : "entry", "");
			const parts = [
				known.has(r.id) ? r.name : "???",
				withText ? `with ${withText}` : "on its own",
			];
			if (r.catalyst && r.catalyst !== s)
				parts.push(`near ${speciesLabel(r.catalyst)}`);
			entry.append(parts.join(" · "));
			if (r.needsHeat) entry.append(span("flick", "⚡ flick"));
			row.append(entry);
		}
		if (list.length > REACTIONS_SHOWN)
			row.append(span("more", `+${list.length - REACTIONS_SHOWN} more`));
		this.root.append(section("Reacts with", row));
	}

	private candidates(e: Entity, counts: Counts): void {
		const list = candidatesFor(counts, this.known());
		if (list.length === 0) return;
		const row = div("row");
		for (const c of list.slice(0, SHOWN)) row.append(this.entry(c, e));
		if (list.length > SHOWN)
			row.append(span("more", `+${list.length - SHOWN} more`));
		this.root.append(section("Could become", row));
	}

	private entry(c: Candidate, from: Entity): HTMLElement {
		const b = document.createElement("button");
		b.type = "button";
		b.className = c.known ? "entry known" : "entry";
		b.append(c.known ? `${c.recipe.label} ${c.recipe.name}` : "???");
		for (const [el, n] of missingList(c.missing)) {
			const chip = span("chip", `+${n} ${el}`);
			const info = ELEMENT_INFO[el];
			chip.style.background = info ? hex(info.color) : "#888";
			chip.style.color = info && luminance(info.color) > 0.6 ? "#111" : "#fff";
			b.append(chip);
		}
		b.addEventListener("click", () => this.onPick(c, from));
		return b;
	}
}

function section(title: string, body: HTMLElement): HTMLElement {
	const s = div("sect");
	s.append(span("label", title), body);
	return s;
}

function div(cls: string): HTMLElement {
	const d = document.createElement("div");
	d.className = cls;
	return d;
}

function span(cls: string, text: string): HTMLElement {
	const s = document.createElement("span");
	s.className = cls;
	s.textContent = text;
	return s;
}

function luminance(color: number): number {
	return (
		(0.2126 * ((color >> 16) & 255) +
			0.7152 * ((color >> 8) & 255) +
			0.0722 * (color & 255)) /
		255
	);
}
