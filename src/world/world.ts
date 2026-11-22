import Matter from "matter-js";
import {
	addCounts,
	type Counts,
	ELEMENT_INFO,
	type Element,
	elementInfo,
} from "../chemistry/elements";
import { layoutFor } from "../chemistry/layouts";
import { findRecipe, type Recipe, recipeById } from "../chemistry/recipes";
import { resolveAtoms, tierFor } from "../chemistry/resolve";
import type { Tier } from "../chemistry/structures";
import { type Bus, createBus, type Point } from "./events";

const { Bodies, Body, Composite, Constraint, Engine, Events, Query } = Matter;
type MBody = Matter.Body;
type MConstraint = Matter.Constraint;

/** Free atoms and loose clusters: atom bodies tied together by soft springs. */
export interface AtomsEntity {
	kind: "atoms";
	id: number;
	group: number;
	bodies: MBody[];
	springs: MConstraint[];
	/** World time it was made; multi-atom clusters fall apart after LOOSE_MS. */
	bornAt: number;
}

/** A snapped molecule: one rigid compound body, one part per atom. */
export interface MoleculeEntity {
	kind: "molecule";
	id: number;
	group: number;
	body: MBody;
	recipe: Recipe;
}

/** Same-kind molecules clumped together by springs and a pull to the middle. */
export interface StructureEntity {
	kind: "structure";
	id: number;
	group: number;
	recipe: Recipe;
	members: MBody[];
	springs: MConstraint[];
	tier: Tier | undefined;
}

export type Entity = AtomsEntity | MoleculeEntity | StructureEntity;

export type BondOutcome = "snap" | "loose" | "join" | "fizzle";

/** A body's place and motion, as saved. */
export interface Pose {
	x: number;
	y: number;
	angle: number;
	vx: number;
	vy: number;
	av: number;
}

export type EntitySnapshot =
	| { kind: "atoms"; age: number; atoms: (Pose & { element: Element })[] }
	| ({ kind: "molecule"; recipe: string } & Pose)
	| { kind: "structure"; recipe: string; members: Pose[] };

export interface WorldSnapshot {
	time: number;
	width: number;
	height: number;
	entities: EntitySnapshot[];
}

/** What each atom circle carries, on the body (free atoms) or the part (molecules). */
export interface AtomTag {
	element: Element;
	radius: number;
}

interface BodyTag {
	entityId: number;
	/** Molecule bodies: radius of the circle that encloses all their atoms. */
	reach?: number;
}

const STEP_MS = 1000 / 60;
/** How close two circles must be (beyond touching) to count as dropped onto. */
const DROP_MARGIN = 10;
const SPRING_STIFFNESS = 0.03;
const STRUCTURE_SPRING_STIFFNESS = 0.008;
const COHESION = 0.0000015;
const DRIFT = 0.000012;
const WALL = 400;
const WALL_CATEGORY = 0x0002;
/** An unfinished cluster left alone this long falls apart. */
export const LOOSE_MS = 20_000;

export interface WorldOptions {
	width: number;
	height: number;
	/** Seeded randomness for tests; defaults to Math.random. */
	random?: () => number;
}

export class World {
	readonly engine: Matter.Engine;
	readonly events: Bus = createBus();
	width: number;
	height: number;
	private readonly entities = new Map<number, Entity>();
	private nextId = 1;
	private walls: MBody[] = [];
	private accumulator = 0;
	/** Simulated milliseconds since the world began (survives save/load). */
	time = 0;
	private readonly random: () => number;

	constructor(opts: WorldOptions) {
		this.width = opts.width;
		this.height = opts.height;
		this.random = opts.random ?? Math.random;
		this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
		this.buildWalls();
		Events.on(this.engine, "beforeUpdate", () => this.applyForces());
	}

	// ── Queries ────────────────────────────────────────────────────────────

	all(): Iterable<Entity> {
		return this.entities.values();
	}

	get(id: number): Entity | undefined {
		return this.entities.get(id);
	}

	/** The bodies that move as this entity (parents, not compound parts). */
	bodiesOf(e: Entity): MBody[] {
		if (e.kind === "atoms") return e.bodies;
		if (e.kind === "molecule") return [e.body];
		return e.members;
	}

	/** Every atom circle in the entity, as bodies whose plugin holds an AtomTag. */
	circlesOf(e: Entity): MBody[] {
		return this.bodiesOf(e).flatMap((b) =>
			b.parts.length > 1 ? b.parts.slice(1) : [b],
		);
	}

	springsOf(e: Entity): MConstraint[] {
		return e.kind === "molecule" ? [] : e.springs;
	}

	countsOf(e: Entity): Counts {
		const c: Counts = {};
		for (const p of this.circlesOf(e)) {
			const el = atomTag(p).element;
			c[el] = (c[el] ?? 0) + 1;
		}
		return c;
	}

	centroidOf(e: Entity): Point {
		return centroid(this.circlesOf(e).map((p) => p.position));
	}

	/** The entity a body belongs to. */
	entityOfBody(b: MBody): Entity | undefined {
		const tag = (b.parent ?? b).plugin as BodyTag | undefined;
		return tag?.entityId === undefined
			? undefined
			: this.entities.get(tag.entityId);
	}

	entityAt(p: Point): { entity: Entity; body: MBody } | undefined {
		const bodies = [...this.entities.values()].flatMap((e) => this.bodiesOf(e));
		const hit = Query.point(bodies, p)[0];
		if (!hit) return undefined;
		const entity = this.entityOfBody(hit);
		return entity && { entity, body: hit };
	}

	/** The other entity whose atoms `e` is touching most closely, if any. */
	bondTarget(e: Entity): Entity | undefined {
		const mine = this.circlesOf(e);
		let best: Entity | undefined;
		let bestGap = DROP_MARGIN;
		for (const other of this.entities.values()) {
			if (other === e) continue;
			for (const a of mine)
				for (const b of this.circlesOf(other)) {
					const gap =
						Math.hypot(
							a.position.x - b.position.x,
							a.position.y - b.position.y,
						) -
						atomTag(a).radius -
						atomTag(b).radius;
					if (gap < bestGap) {
						bestGap = gap;
						best = other;
					}
				}
		}
		return best;
	}

	/** Free single atoms, which zen mode keeps under a cap. */
	freeAtomCount(): number {
		let n = 0;
		for (const e of this.entities.values())
			if (e.kind === "atoms" && e.bodies.length === 1) n++;
		return n;
	}

	// ── Time ───────────────────────────────────────────────────────────────

	/** Advance by real elapsed time, in fixed physics steps. */
	step(dtMs: number): void {
		this.accumulator += Math.min(dtMs, 100);
		while (this.accumulator >= STEP_MS) {
			Engine.update(this.engine, STEP_MS);
			this.accumulator -= STEP_MS;
			this.time += STEP_MS;
		}
		this.expireLoose();
	}

	/** Unfinished clusters left alone too long fall apart. */
	private expireLoose(): void {
		for (const e of [...this.entities.values()]) {
			if (e.kind !== "atoms" || e.bodies.length < 2) continue;
			if (this.time - e.bornAt < LOOSE_MS) continue;
			if (this.isGhost(e)) continue; // being held
			const at = this.centroidOf(e);
			const atoms = this.looseAtoms(e);
			this.forget(e);
			for (const a of atoms) this.scatter(this.makeAtoms([a]), at);
			this.events.emit("fizzled", { at });
		}
	}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		Composite.remove(this.engine.world, this.walls);
		this.buildWalls();
		for (const e of this.entities.values())
			for (const b of this.bodiesOf(e))
				Body.setPosition(b, {
					x: clamp(b.position.x, 20, width - 20),
					y: clamp(b.position.y, 20, height - 20),
				});
	}

	/** A ghost collides with nothing (but walls), so it can be dropped onto others. */
	setGhost(e: Entity, ghost: boolean): void {
		const mask = ghost ? WALL_CATEGORY : 0xffffffff;
		for (const b of this.bodiesOf(e))
			for (const p of b.parts) p.collisionFilter.mask = mask;
	}

	isGhost(e: Entity): boolean {
		const b = this.bodiesOf(e)[0];
		return !!b && b.collisionFilter.mask === WALL_CATEGORY;
	}

	// ── Saving ─────────────────────────────────────────────────────────────

	/** Everything needed to rebuild the board exactly (positions, motion, bonds). */
	snapshot(): WorldSnapshot {
		const entities: EntitySnapshot[] = [];
		for (const e of this.entities.values()) {
			if (e.kind === "atoms")
				entities.push({
					kind: "atoms",
					age: this.time - e.bornAt,
					atoms: e.bodies.map((b) => ({
						element: atomTag(b).element,
						...pose(b),
					})),
				});
			else if (e.kind === "molecule")
				entities.push({
					kind: "molecule",
					recipe: e.recipe.id,
					...pose(e.body),
				});
			else
				entities.push({
					kind: "structure",
					recipe: e.recipe.id,
					members: e.members.map(pose),
				});
		}
		return {
			time: this.time,
			width: this.width,
			height: this.height,
			entities,
		};
	}

	/** Replace the board with a snapshot. Unknown recipes or elements are skipped. */
	load(snap: WorldSnapshot): void {
		for (const e of [...this.entities.values()]) this.forget(e);
		this.time = snap.time;
		const sx = this.width / (snap.width || this.width);
		const sy = this.height / (snap.height || this.height);
		const place = <P extends Pose>(p: P): P => ({
			...p,
			x: p.x * sx,
			y: p.y * sy,
		});
		for (const s of snap.entities) {
			if (s.kind === "atoms") {
				const atoms = s.atoms.filter((a) => ELEMENT_INFO[a.element]).map(place);
				if (!atoms.length) continue;
				const e = this.makeAtoms(atoms);
				e.bornAt = this.time - s.age;
			} else {
				const recipe = findRecipe(s.recipe);
				if (!recipe) continue;
				const poses = (s.kind === "molecule" ? [s] : s.members).map(place);
				const bodies = poses.map((p) => {
					const m = this.makeMolecule(recipe, p, { x: p.vx, y: p.vy });
					Body.setAngle(m.body, p.angle);
					Body.setAngularVelocity(m.body, p.av);
					return m;
				});
				if (s.kind === "structure" && bodies.length > 1) {
					for (const m of bodies) this.forget(m);
					const members = bodies.map((m) => m.body);
					this.adopt({
						kind: "structure",
						id: this.nextId++,
						group: Body.nextGroup(true),
						recipe,
						members,
						springs: [],
						tier: tierFor(recipe.id, members.length),
					});
				}
			}
		}
	}

	// ── Making things ──────────────────────────────────────────────────────

	spawnAtom(element: Element, at?: Point): AtomsEntity {
		const r = elementInfo(element).radius;
		const pos = at ?? {
			x: r + this.random() * (this.width - 2 * r),
			y: r + this.random() * (this.height - 2 * r),
		};
		const e = this.makeAtoms([{ element, x: pos.x, y: pos.y, vx: 0, vy: 0 }]);
		const v = 0.4;
		Body.setVelocity(e.bodies[0] as MBody, {
			x: (Math.random() - 0.5) * v,
			y: (Math.random() - 0.5) * v,
		});
		this.events.emit("spawned", { entityId: e.id, element, at: pos });
		return e;
	}

	/** Put a molecule straight into the world (tests, future puzzle modes). */
	spawnMolecule(recipeId: string, at: Point): MoleculeEntity {
		return this.makeMolecule(recipeById(recipeId), at, { x: 0, y: 0 });
	}

	// ── The rules ──────────────────────────────────────────────────────────

	/** What dropping `a` onto `b` would do, without doing it. */
	predict(a: Entity, b: Entity): { outcome: BondOutcome; recipe?: Recipe } {
		if (a === b) return { outcome: "fizzle" };
		const recipeA = clumpRecipe(a);
		const recipeB = clumpRecipe(b);
		if (recipeA && recipeB && recipeA.id === recipeB.id)
			return { outcome: "join", recipe: recipeA };
		if (a.kind === "structure" || b.kind === "structure")
			return { outcome: "fizzle" };
		const res = resolveAtoms(addCounts(this.countsOf(a), this.countsOf(b)));
		if (res.kind === "snap") return { outcome: "snap", recipe: res.recipe };
		return { outcome: res.kind };
	}

	/** Drop `a` onto `b`: bond, snap, join a structure, or bounce apart. */
	tryBond(a: Entity, b: Entity): BondOutcome {
		const at = centroid([this.centroidOf(a), this.centroidOf(b)]);
		const { outcome, recipe } = this.predict(a, b);
		if (outcome === "fizzle") return this.fizzle(a, b, at);
		if (outcome === "join" && recipe) {
			this.join(a, b, recipe, at);
			return "join";
		}

		const atoms = [...this.looseAtoms(a), ...this.looseAtoms(b)];
		const vel = averageVelocity([...this.bodiesOf(a), ...this.bodiesOf(b)]);
		this.forget(a);
		this.forget(b);
		if (outcome === "snap" && recipe) {
			const m = this.makeMolecule(recipe, at, vel);
			this.events.emit("snapped", { entityId: m.id, recipe, at });
			return "snap";
		}
		const cluster = this.makeAtoms(atoms);
		this.events.emit("bonded", { entityId: cluster.id, at });
		return "loose";
	}

	/** Double-tap: undo one step of building. */
	split(e: Entity, tapped?: MBody): void {
		const at = this.centroidOf(e);
		if (e.kind === "atoms") {
			if (e.bodies.length < 2) return;
			const atoms = this.looseAtoms(e);
			this.forget(e);
			for (const a of atoms) this.scatter(this.makeAtoms([a]), at);
		} else if (e.kind === "molecule") {
			const atoms = this.looseAtoms(e);
			this.forget(e);
			for (const a of atoms) this.scatter(this.makeAtoms([a]), at);
		} else {
			const member = (tapped?.parent ?? tapped) as MBody | undefined;
			const leaving =
				member && e.members.includes(member) ? member : e.members.at(-1);
			if (!leaving) return;
			this.detachMember(e, leaving);
		}
		this.events.emit("split", { at });
	}

	// ── Internals ──────────────────────────────────────────────────────────

	private join(a: Entity, b: Entity, recipe: Recipe, at: Point): void {
		const members = [...this.bodiesOf(a), ...this.bodiesOf(b)];
		const before = Math.max(
			a.kind === "structure" ? a.members.length : 1,
			b.kind === "structure" ? b.members.length : 1,
		);
		const oldTier = tierFor(recipe.id, before);
		this.forget(a);
		this.forget(b);
		const s: StructureEntity = {
			kind: "structure",
			id: this.nextId++,
			group: Body.nextGroup(true),
			recipe,
			members,
			springs: [],
			tier: tierFor(recipe.id, members.length),
		};
		this.adopt(s);
		this.events.emit("joined", {
			entityId: s.id,
			recipe,
			count: members.length,
			at,
		});
		if (s.tier && s.tier !== oldTier)
			this.events.emit("tierUp", {
				entityId: s.id,
				recipe,
				tier: s.tier,
				at: this.centroidOf(s),
			});
	}

	private detachMember(s: StructureEntity, leaving: MBody): void {
		const rest = s.members.filter((m) => m !== leaving);
		this.forget(s);
		const loner: MoleculeEntity = {
			kind: "molecule",
			id: this.nextId++,
			group: Body.nextGroup(true),
			body: leaving,
			recipe: s.recipe,
		};
		this.adopt(loner);
		if (rest.length === 1) {
			this.adopt({
				kind: "molecule",
				id: this.nextId++,
				group: Body.nextGroup(true),
				body: rest[0] as MBody,
				recipe: s.recipe,
			});
		} else {
			this.adopt({
				...s,
				id: this.nextId++,
				group: Body.nextGroup(true),
				members: rest,
				springs: [],
				tier: tierFor(s.recipe.id, rest.length),
			});
		}
		const away = normalize({
			x: leaving.position.x - centroid(rest.map((m) => m.position)).x,
			y: leaving.position.y - centroid(rest.map((m) => m.position)).y,
		});
		Body.setVelocity(leaving, { x: away.x * 3, y: away.y * 3 });
	}

	/** Register an entity built from existing bodies: tag them, wire springs, add to the world. */
	private adopt(e: Entity): void {
		for (const b of this.bodiesOf(e)) {
			(b.plugin as BodyTag).entityId = e.id;
			setGroup(b, e.group);
		}
		if (e.kind === "structure") e.springs = this.structureSprings(e.members);
		const springs = this.springsOf(e);
		Composite.add(this.engine.world, [...this.bodiesOf(e), ...springs]);
		this.entities.set(e.id, e);
	}

	/** Take an entity out of the world without destroying its bodies' identity. */
	private forget(e: Entity): void {
		Composite.remove(this.engine.world, [
			...this.bodiesOf(e),
			...this.springsOf(e),
		]);
		this.entities.delete(e.id);
	}

	private makeAtoms(
		atoms: { element: Element; x: number; y: number; vx: number; vy: number }[],
	): AtomsEntity {
		const group = Body.nextGroup(true);
		const bodies = atoms.map((a) => {
			const r = elementInfo(a.element).radius;
			const b = Bodies.circle(a.x, a.y, r, {
				frictionAir: 0.025,
				restitution: 0.6,
				friction: 0,
				density: 0.001 * (r / 14),
			});
			Object.assign(b.plugin, {
				element: a.element,
				radius: r,
			} satisfies AtomTag);
			Body.setVelocity(b, { x: a.vx, y: a.vy });
			return b;
		});
		const e: AtomsEntity = {
			kind: "atoms",
			id: this.nextId++,
			group,
			bodies,
			bornAt: this.time,
			springs: treeSprings(
				bodies,
				SPRING_STIFFNESS,
				(a, b) => (atomTag(a).radius + atomTag(b).radius) * 0.95,
			),
		};
		this.adopt(e);
		return e;
	}

	private makeMolecule(recipe: Recipe, at: Point, vel: Point): MoleculeEntity {
		const placed = layoutFor(recipe, (el) => elementInfo(el).radius);
		const mid = centroid(placed);
		const parts = placed.map((p) => {
			const r = elementInfo(p.el).radius;
			const part = Bodies.circle(at.x + p.x - mid.x, at.y + p.y - mid.y, r, {
				density: 0.001 * (r / 14),
			});
			Object.assign(part.plugin, {
				element: p.el,
				radius: r,
			} satisfies AtomTag);
			return part;
		});
		// Matter reuses the array it's given and puts the parent in at index 0.
		const body = Body.create({
			parts: [...parts],
			frictionAir: 0.03,
			restitution: 0.5,
			friction: 0,
		});
		const reach = Math.max(
			...parts.map(
				(p) =>
					Math.hypot(
						p.position.x - body.position.x,
						p.position.y - body.position.y,
					) + atomTag(p).radius,
			),
		);
		Object.assign(body.plugin, { reach } satisfies Partial<BodyTag>);
		Body.setVelocity(body, vel);
		Body.setAngle(body, (Math.random() - 0.5) * 0.6);
		const m: MoleculeEntity = {
			kind: "molecule",
			id: this.nextId++,
			group: Body.nextGroup(true),
			body,
			recipe,
		};
		this.adopt(m);
		return m;
	}

	/** An entity's atoms as free-standing descriptions (positions, velocities). */
	private looseAtoms(e: Entity) {
		return this.circlesOf(e).map((p) => {
			const parent = p.parent ?? p;
			return {
				element: atomTag(p).element,
				x: p.position.x,
				y: p.position.y,
				vx: parent.velocity.x,
				vy: parent.velocity.y,
			};
		});
	}

	private structureSprings(members: MBody[]): MConstraint[] {
		const springs: MConstraint[] = [];
		const seen = new Set<string>();
		for (const m of members) {
			const nearest = members
				.filter((o) => o !== m)
				.sort(
					(p, q) => dist(m.position, p.position) - dist(m.position, q.position),
				)
				.slice(0, 2);
			for (const o of nearest) {
				const key = m.id < o.id ? `${m.id}-${o.id}` : `${o.id}-${m.id}`;
				if (seen.has(key)) continue;
				seen.add(key);
				springs.push(
					Constraint.create({
						bodyA: m,
						bodyB: o,
						length: (reachOf(m) + reachOf(o)) * 0.85,
						stiffness: STRUCTURE_SPRING_STIFFNESS,
						damping: 0.05,
					}),
				);
			}
		}
		return springs;
	}

	private fizzle(a: Entity, b: Entity, at: Point): "fizzle" {
		const ca = this.centroidOf(a);
		const cb = this.centroidOf(b);
		const dir = normalize({ x: ca.x - cb.x, y: ca.y - cb.y });
		for (const body of this.bodiesOf(a))
			Body.setVelocity(body, {
				x: body.velocity.x + dir.x * 2.5,
				y: body.velocity.y + dir.y * 2.5,
			});
		for (const body of this.bodiesOf(b))
			Body.setVelocity(body, {
				x: body.velocity.x - dir.x * 2.5,
				y: body.velocity.y - dir.y * 2.5,
			});
		this.events.emit("fizzled", { at });
		return "fizzle";
	}

	private scatter(e: AtomsEntity, from: Point): void {
		const b = e.bodies[0] as MBody;
		const dir = normalize({
			x: b.position.x - from.x,
			y: b.position.y - from.y,
		});
		Body.setVelocity(b, { x: dir.x * 2.5, y: dir.y * 2.5 });
	}

	/** Gentle brownian drift for loose things, and a pull together for structures. */
	private applyForces(): void {
		for (const e of this.entities.values()) {
			if (e.kind === "structure") {
				const c = centroid(e.members.map((m) => m.position));
				for (const m of e.members)
					Body.applyForce(m, m.position, {
						x: (c.x - m.position.x) * COHESION * m.mass,
						y: (c.y - m.position.y) * COHESION * m.mass,
					});
				continue;
			}
			for (const b of this.bodiesOf(e))
				Body.applyForce(b, b.position, {
					x: (Math.random() - 0.5) * DRIFT * b.mass,
					y: (Math.random() - 0.5) * DRIFT * b.mass,
				});
		}
	}

	private buildWalls(): void {
		const { width: w, height: h } = this;
		const opts = {
			isStatic: true,
			restitution: 0.8,
			collisionFilter: { category: WALL_CATEGORY },
		};
		this.walls = [
			Bodies.rectangle(w / 2, -WALL / 2, w + 2 * WALL, WALL, opts),
			Bodies.rectangle(w / 2, h + WALL / 2, w + 2 * WALL, WALL, opts),
			Bodies.rectangle(-WALL / 2, h / 2, WALL, h + 2 * WALL, opts),
			Bodies.rectangle(w + WALL / 2, h / 2, WALL, h + 2 * WALL, opts),
		];
		Composite.add(this.engine.world, this.walls);
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** The recipe an entity clumps as, if it's a molecule or a structure. */
function clumpRecipe(e: Entity): Recipe | undefined {
	return e.kind === "atoms" ? undefined : e.recipe;
}

export function atomTag(part: MBody): AtomTag {
	return part.plugin as AtomTag;
}

function reachOf(b: MBody): number {
	return (b.plugin as BodyTag).reach ?? 30;
}

function setGroup(b: MBody, group: number): void {
	b.collisionFilter.group = group;
	for (const p of b.parts) p.collisionFilter.group = group;
}

/** Springs along a minimum spanning tree of the bodies' current positions. */
function treeSprings(
	bodies: MBody[],
	stiffness: number,
	length: (a: MBody, b: MBody) => number,
): MConstraint[] {
	if (bodies.length < 2) return [];
	const inTree = [bodies[0] as MBody];
	const rest = bodies.slice(1);
	const springs: MConstraint[] = [];
	while (rest.length) {
		let bi = 0;
		let bj = 0;
		let bd = Number.POSITIVE_INFINITY;
		for (let i = 0; i < inTree.length; i++)
			for (let j = 0; j < rest.length; j++) {
				const d = dist(
					(inTree[i] as MBody).position,
					(rest[j] as MBody).position,
				);
				if (d < bd) {
					bd = d;
					bi = i;
					bj = j;
				}
			}
		const a = inTree[bi] as MBody;
		const [b] = rest.splice(bj, 1) as [MBody];
		inTree.push(b);
		springs.push(
			Constraint.create({
				bodyA: a,
				bodyB: b,
				length: length(a, b),
				stiffness,
				damping: 0.08,
			}),
		);
	}
	return springs;
}

function centroid(ps: Point[]): Point {
	if (ps.length === 0) return { x: 0, y: 0 };
	let x = 0;
	let y = 0;
	for (const p of ps) {
		x += p.x;
		y += p.y;
	}
	return { x: x / ps.length, y: y / ps.length };
}

function averageVelocity(bodies: MBody[]): Point {
	return centroid(bodies.map((b) => b.velocity));
}

function dist(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(v: Point): Point {
	const l = Math.hypot(v.x, v.y);
	if (l < 1e-6) {
		const a = Math.random() * Math.PI * 2;
		return { x: Math.cos(a), y: Math.sin(a) };
	}
	return { x: v.x / l, y: v.y / l };
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

function pose(b: MBody): Pose {
	const r = (v: number) => Math.round(v * 100) / 100;
	return {
		x: r(b.position.x),
		y: r(b.position.y),
		angle: r(b.angle),
		vx: r(b.velocity.x),
		vy: r(b.velocity.y),
		av: Math.round(b.angularVelocity * 10000) / 10000,
	};
}
