import Matter from "matter-js";
import type { Entity, World } from "../world/world";

const { Events, Mouse, MouseConstraint } = Matter;

/** Below this many pixels of travel, a press is a tap, not a drag. */
const TAP_SLOP = 8;
const TAP_MS = 280;
const DOUBLE_TAP_MS = 380;

/**
 * Drag to bond, double-tap to split. Dragging is Matter's own MouseConstraint
 * (mouse and touch); we only decide what a release means.
 */
export class Input {
	private readonly mouseConstraint: Matter.MouseConstraint;
	private dragStart = { x: 0, y: 0, t: 0 };
	private lastTap: { entityId: number; t: number } | undefined;

	constructor(
		private readonly world: World,
		element: HTMLElement,
		pixelRatio: number,
	) {
		const mouse = Mouse.create(element);
		// Matter parseInt()s the data attribute, which breaks 1.5x screens.
		mouse.pixelRatio = pixelRatio;
		this.mouseConstraint = MouseConstraint.create(world.engine, {
			mouse,
			constraint: {
				stiffness: 0.25,
				damping: 0.1,
				render: { visible: false },
			} as Matter.IConstraintDefinition,
		});
		Matter.Composite.add(world.engine.world, this.mouseConstraint);

		Events.on(this.mouseConstraint, "startdrag", (ev) => {
			this.dragStart = { ...mouse.position, t: performance.now() };
			// A held thing passes through others, so you can drop it right on its partner.
			const held = this.world.entityOfBody(bodyOf(ev));
			if (held) this.world.setGhost(held, true);
		});
		Events.on(this.mouseConstraint, "enddrag", (ev) =>
			this.release(bodyOf(ev)),
		);
	}

	/** The entity being dragged right now, if any. */
	dragging(): Entity | undefined {
		const b = this.mouseConstraint.body;
		return b ? this.world.entityOfBody(b) : undefined;
	}

	private release(body: Matter.Body): void {
		const entity = this.world.entityOfBody(body);
		if (!entity) return;
		this.world.setGhost(entity, false);
		const p = this.mouseConstraint.mouse.position;
		const moved = Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y);
		const now = performance.now();

		if (moved < TAP_SLOP && now - this.dragStart.t < TAP_MS) {
			const last = this.lastTap;
			if (last && last.entityId === entity.id && now - last.t < DOUBLE_TAP_MS) {
				this.lastTap = undefined;
				this.world.split(entity, body);
			} else {
				this.lastTap = { entityId: entity.id, t: now };
			}
			return;
		}

		const target = this.world.bondTarget(entity);
		if (target) this.world.tryBond(entity, target);
	}
}

/** Matter's drag events carry the body, but its typings don't say so. */
function bodyOf(ev: unknown): Matter.Body {
	return (ev as { body: Matter.Body }).body;
}
