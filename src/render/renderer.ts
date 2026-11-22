import type Matter from "matter-js";
import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { elementInfo } from "../chemistry/elements";
import type { Point } from "../world/events";
import {
	type AtomsEntity,
	atomTag,
	type Entity,
	type World,
} from "../world/world";
import {
	ATOM_TEXTURE_PAD,
	ATOM_TEXTURE_SCALE,
	atomTexture,
	glowTexture,
	ringTexture,
} from "./textures";

interface AtomVisual {
	glow: Sprite;
	core: Sprite;
	born: number;
	/** How long the pop-in lasts; spawned atoms pop slower than rebuilt ones. */
	popMs: number;
	seen: number;
}

interface EntityVisual {
	halo: Sprite;
	label: Text;
	seen: number;
}

interface Particle {
	sprite: Sprite;
	vx: number;
	vy: number;
	life: number;
	age: number;
	grow: number;
	from: number;
}

/** How long before a loose cluster breaks up its bonds start to flicker. */
const WARN_MS = 5000;

/** What the renderer outlines on top of the board. */
export interface Overlay {
	selected(): Entity | undefined;
	guided(now: number): Matter.Body[];
}

const OUTCOME_COLOR = {
	snap: 0x7dffb2,
	join: 0x7dd8ff,
	loose: 0xffffff,
	fizzle: 0xff6b6b,
};

/** Draws the world with PixiJS and plays effects off world events. */
export class Renderer {
	private readonly links = new Graphics();
	private readonly halos = new Container();
	private readonly glows = new Container();
	private readonly atoms = new Container();
	private readonly labels = new Container();
	private readonly fx = new Container();
	private readonly atomVisuals = new Map<number, AtomVisual>();
	private readonly entityVisuals = new Map<number, EntityVisual>();
	private readonly particles: Particle[] = [];
	private readonly recentSpawns = new Set<number>();
	private readonly tex: {
		glow: Texture;
		ring: Texture;
	};
	private frame = 0;

	constructor(
		stage: Container,
		private readonly world: World,
		private readonly dragging: () => Entity | undefined,
		private readonly overlay: Overlay = {
			selected: () => undefined,
			guided: () => [],
		},
	) {
		this.tex = {
			glow: glowTexture(),
			ring: ringTexture(),
		};
		this.halos.blendMode = "add";
		this.glows.blendMode = "add";
		this.fx.blendMode = "add";
		stage.addChild(
			this.halos,
			this.links,
			this.glows,
			this.atoms,
			this.labels,
			this.fx,
		);

		const ev = world.events;
		ev.on("spawned", (e) => this.recentSpawns.add(e.entityId));
		ev.on("snapped", (e) => this.burst(e.at, e.recipe.color, 1));
		ev.on("joined", (e) => this.ring(e.at, e.recipe.color, 60, 500));
		ev.on("tierUp", (e) => {
			this.burst(e.at, e.recipe.color, 2.2);
			this.ring(e.at, 0xffffff, 160, 1100);
		});
		ev.on("bonded", (e) => this.ring(e.at, 0xffffff, 30, 300));
		ev.on("fizzled", (e) => this.sparks(e.at, 0xff8a7a, 7));
		ev.on("split", (e) => this.sparks(e.at, 0xffffff, 10));
		ev.on("faded", (e) => this.ghost(e.at, e.element));
	}

	draw(dtMs: number): void {
		this.frame++;
		const now = performance.now();
		this.links.clear();

		const held = this.dragging();
		const target = held && this.world.bondTarget(held);

		for (const e of this.world.all()) {
			const flicker = this.flicker(e, now);
			this.drawSprings(e, flicker);
			const pop = this.recentSpawns.has(e.id);
			for (const part of this.world.circlesOf(e))
				this.syncAtom(part, pop, now, flicker);
			if (e.kind !== "atoms") this.syncEntity(e);
		}
		this.recentSpawns.clear();
		this.drawOverlay(now);

		if (held && target) {
			const { outcome } = this.world.predict(held, target);
			const color = OUTCOME_COLOR[outcome];
			for (const part of this.world.circlesOf(target)) {
				const r = atomTag(part).radius + 5 + Math.sin(now / 120) * 1.5;
				this.links
					.circle(part.position.x, part.position.y, r)
					.stroke({ width: 2, color, alpha: 0.8 });
			}
		}

		this.reap(this.atomVisuals, (v) => {
			v.glow.destroy();
			v.core.destroy();
		});
		this.reap(this.entityVisuals, (v) => {
			v.halo.destroy();
			v.label.destroy();
		});
		this.stepParticles(dtMs);
	}

	/** Outline the selection; pulse the atoms a tray entry pointed at. */
	private drawOverlay(now: number): void {
		const sel = this.overlay.selected();
		if (sel)
			for (const part of this.world.circlesOf(sel))
				this.links
					.circle(part.position.x, part.position.y, atomTag(part).radius + 4)
					.stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
		const pulse = 0.5 + 0.5 * Math.sin(now / 160);
		for (const b of this.overlay.guided(now)) {
			if (!this.world.entityOfBody(b)) continue;
			const r = atomTag(b).radius + 7 + pulse * 5;
			this.links
				.circle(b.position.x, b.position.y, r)
				.stroke({ width: 3, color: 0xffe27a, alpha: 0.35 + 0.5 * pulse });
		}
	}

	/**
	 * 1 normally; for an unfinished cluster in its last seconds, a pulse that
	 * dips to near-invisible and quickens toward the end.
	 */
	private flicker(e: Entity, now: number): number {
		const left = this.world.timeLeft(e);
		if (left === undefined || left >= WARN_MS) return 1;
		const period = left < 2000 ? 60 : 130;
		return 0.15 + 0.85 * Math.abs(Math.cos(now / period));
	}

	private syncAtom(
		part: Matter.Body,
		pop: boolean,
		now: number,
		flicker: number,
	): void {
		const tag = atomTag(part);
		let v = this.atomVisuals.get(part.id);
		if (!v) {
			const glow = new Sprite(this.tex.glow);
			glow.anchor.set(0.5);
			glow.tint = elementInfo(tag.element).glow;
			glow.alpha = 0.55;
			const core = new Sprite(atomTexture(tag.element));
			core.anchor.set(0.5);
			this.glows.addChild(glow);
			this.atoms.addChild(core);
			v = { glow, core, born: now, popMs: pop ? 450 : 140, seen: 0 };
			this.atomVisuals.set(part.id, v);
		}
		v.seen = this.frame;
		const t = Math.min(1, (now - v.born) / v.popMs);
		const s = easeOutBack(t);
		const base = 1 / ATOM_TEXTURE_SCALE;
		v.core.scale.set(base * s);
		v.core.position.set(part.position.x, part.position.y);
		const glowSize = ((tag.radius + ATOM_TEXTURE_PAD) * 3.4) / 128;
		v.glow.scale.set(glowSize * s);
		v.glow.position.copyFrom(v.core.position);
		v.core.alpha = flicker;
		v.glow.alpha = 0.55 * flicker;
	}

	private syncEntity(e: Exclude<Entity, AtomsEntity>): void {
		let v = this.entityVisuals.get(e.id);
		if (!v) {
			const halo = new Sprite(this.tex.glow);
			halo.anchor.set(0.5);
			halo.tint = e.recipe.color;
			const label = new Text({
				text: "",
				style: {
					fontFamily: "ui-rounded, system-ui, sans-serif",
					fontSize: 12,
					fill: 0xffffff,
					letterSpacing: 0.5,
				},
				resolution: 2,
			});
			label.anchor.set(0.5, 0);
			label.alpha = 0;
			this.halos.addChild(halo);
			this.labels.addChild(label);
			v = { halo, label, seen: 0 };
			this.entityVisuals.set(e.id, v);
		}
		v.seen = this.frame;

		const circles = this.world.circlesOf(e);
		const c = this.world.centroidOf(e);
		let reach = 0;
		for (const p of circles)
			reach = Math.max(
				reach,
				Math.hypot(p.position.x - c.x, p.position.y - c.y) + atomTag(p).radius,
			);

		const isStructure = e.kind === "structure";
		v.halo.position.set(c.x, c.y);
		v.halo.scale.set((reach * (isStructure ? 3.2 : 2.6)) / 128);
		v.halo.alpha = isStructure ? (e.tier ? 0.6 : 0.4) : 0.42;

		const text = isStructure
			? e.tier
				? `${e.tier.name} · ${e.members.length} ${e.recipe.label}`
				: `${e.members.length} × ${e.recipe.label}`
			: e.recipe.label;
		if (v.label.text !== text) v.label.text = text;
		v.label.position.set(c.x, c.y + reach + 6);
		v.label.alpha = Math.min(isStructure ? 0.8 : 0.5, v.label.alpha + 0.03);
	}

	private drawSprings(e: Entity, flicker: number): void {
		const springs = this.world.springsOf(e);
		if (springs.length === 0) return;
		const color = e.kind === "structure" ? e.recipe.color : 0xffffff;
		const alpha = (e.kind === "structure" ? 0.14 : 0.4) * flicker;
		const width = e.kind === "structure" ? 2 : 3;
		for (const s of springs) {
			const a = s.bodyA?.position;
			const b = s.bodyB?.position;
			if (!a || !b) continue;
			this.links.moveTo(a.x, a.y).lineTo(b.x, b.y);
		}
		this.links.stroke({ width, color, alpha, cap: "round" });
	}

	private reap<V extends { seen: number }>(
		map: Map<number, V>,
		destroy: (v: V) => void,
	): void {
		for (const [id, v] of map)
			if (v.seen !== this.frame) {
				destroy(v);
				map.delete(id);
			}
	}

	// ── Effects ────────────────────────────────────────────────────────────

	private ring(at: Point, color: number, size: number, life: number): void {
		const sprite = new Sprite(this.tex.ring);
		sprite.anchor.set(0.5);
		sprite.tint = color;
		sprite.position.set(at.x, at.y);
		this.fx.addChild(sprite);
		this.particles.push({
			sprite,
			vx: 0,
			vy: 0,
			life,
			age: 0,
			grow: (size * 2) / 128,
			from: 0.1,
		});
	}

	private burst(at: Point, color: number, power: number): void {
		this.ring(at, color, 70 * power, 650);
		const n = Math.round(12 * power);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
			const speed = (0.08 + Math.random() * 0.12) * power;
			this.dot(
				at,
				color,
				Math.cos(a) * speed,
				Math.sin(a) * speed,
				700 + Math.random() * 400,
				0.22,
			);
		}
	}

	private sparks(at: Point, color: number, n: number): void {
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2;
			const speed = 0.05 + Math.random() * 0.1;
			this.dot(
				at,
				color,
				Math.cos(a) * speed,
				Math.sin(a) * speed,
				350 + Math.random() * 250,
				0.12,
			);
		}
	}

	/** An atom that dissolves where it stood. */
	private ghost(at: Point, element: string): void {
		const sprite = new Sprite(atomTexture(element));
		sprite.anchor.set(0.5);
		sprite.position.set(at.x, at.y);
		const size = 1 / ATOM_TEXTURE_SCALE;
		this.fx.addChild(sprite);
		this.particles.push({
			sprite,
			vx: 0,
			vy: -0.01,
			life: 1400,
			age: 0,
			grow: size * 1.4,
			from: size,
		});
	}

	private dot(
		at: Point,
		color: number,
		vx: number,
		vy: number,
		life: number,
		size: number,
	): void {
		const sprite = new Sprite(this.tex.glow);
		sprite.anchor.set(0.5);
		sprite.tint = color;
		sprite.position.set(at.x, at.y);
		sprite.scale.set(size);
		this.fx.addChild(sprite);
		this.particles.push({
			sprite,
			vx,
			vy,
			life,
			age: 0,
			grow: size,
			from: size,
		});
	}

	private stepParticles(dtMs: number): void {
		for (let i = this.particles.length - 1; i >= 0; i--) {
			const p = this.particles[i] as Particle;
			p.age += dtMs;
			const t = p.age / p.life;
			if (t >= 1) {
				p.sprite.destroy();
				this.particles.splice(i, 1);
				continue;
			}
			p.sprite.x += p.vx * dtMs;
			p.sprite.y += p.vy * dtMs;
			p.vx *= 0.97;
			p.vy *= 0.97;
			p.sprite.scale.set(p.from + (p.grow - p.from) * easeOutCubic(t));
			p.sprite.alpha = 1 - t;
		}
	}
}

function easeOutBack(t: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}
