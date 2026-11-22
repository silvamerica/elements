import Matter from "matter-js";
import type { Point } from "../world/events";
import type { Entity, World } from "../world/world";

const { Events, Mouse, MouseConstraint } = Matter;

/** Below this many screen pixels of travel, a press is a tap, not a drag. */
const TAP_SLOP = 8;
const TAP_MS = 280;
const DOUBLE_TAP_MS = 380;
/** Matter's default mouse-constraint mask: may grab anything. */
const GRAB_ALL = 0xffffffff;

/** What input needs from the camera. */
export interface CameraControl {
	toWorld(screen: Point): Point;
	mouseTransform(): { offset: Point; scale: Point };
	pauseDrag(): void;
	resumeDrag(): void;
	fitWorld(): void;
}

/**
 * Drag to bond, tap to name, double-tap to split; on empty space, drag pans
 * and double-tap zooms out to fit. Atom dragging is Matter's own
 * MouseConstraint (mouse and touch); panning is the camera's. Each press
 * decides once, at pointerdown, which of the two it belongs to.
 */
export class Input {
	private readonly mouseConstraint: Matter.MouseConstraint;
	private readonly mouse: Matter.Mouse;
	private dragStart = { x: 0, y: 0, t: 0 };
	private lastTap: { entityId: number; t: number } | undefined;
	private emptyPress: { x: number; y: number; t: number } | undefined;
	private lastEmptyTap = 0;
	private pointers = 0;
	/** Called on a single tap, with the entity and the atom tapped. */
	onTap: (entity: Entity, body: Matter.Body) => void = () => {};

	constructor(
		private readonly world: World,
		private readonly camera: CameraControl,
		element: HTMLElement,
		pixelRatio: number,
	) {
		this.mouse = Mouse.create(element);
		// Matter parseInt()s the data attribute, which breaks 1.5x screens.
		this.mouse.pixelRatio = pixelRatio;
		this.mouseConstraint = MouseConstraint.create(world.engine, {
			mouse: this.mouse,
			constraint: {
				stiffness: 0.25,
				damping: 0.1,
				render: { visible: false },
			} as Matter.IConstraintDefinition,
		});
		Matter.Composite.add(world.engine.world, this.mouseConstraint);

		Events.on(this.mouseConstraint, "startdrag", (ev) => {
			this.dragStart = { ...this.mouse.absolute, t: performance.now() };
			// A held thing passes through others, so you can drop it right on its partner.
			const held = this.world.entityOfBody(bodyOf(ev));
			if (held) this.world.setGhost(held, true);
		});
		Events.on(this.mouseConstraint, "enddrag", (ev) =>
			this.release(bodyOf(ev)),
		);

		// Capture on window runs before both Matter's and the camera's listeners.
		const opts = { capture: true } as const;
		window.addEventListener("pointerdown", (e) => this.press(e, element), opts);
		window.addEventListener("pointerup", (e) => this.lift(e), opts);
		window.addEventListener("pointercancel", (e) => this.lift(e), opts);
	}

	/** Keep Matter's idea of the pointer in world coordinates as the camera moves. */
	sync(): void {
		const t = this.camera.mouseTransform();
		Mouse.setScale(this.mouse, t.scale);
		Mouse.setOffset(this.mouse, t.offset);
	}

	/** The entity being dragged right now, if any. */
	dragging(): Entity | undefined {
		const b = this.mouseConstraint.body;
		return b ? this.world.entityOfBody(b) : undefined;
	}

	private press(e: PointerEvent, element: HTMLElement): void {
		if (e.target !== element) return;
		this.pointers++;
		if (this.pointers > 1) {
			// A second finger means pinch: let the camera have it, drop any grab.
			this.allowGrab(false);
			return;
		}
		const rect = element.getBoundingClientRect();
		const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		const hit = this.world.entityAt(this.camera.toWorld(screen));
		if (hit) {
			this.camera.pauseDrag();
			this.allowGrab(true);
			this.emptyPress = undefined;
		} else {
			// Panning: Matter mustn't grab whatever slides under the pointer.
			this.allowGrab(false);
			this.emptyPress = { ...screen, t: performance.now() };
		}
	}

	private lift(e: PointerEvent): void {
		this.pointers = Math.max(0, this.pointers - 1);
		if (this.pointers > 0) return;
		this.camera.resumeDrag();
		const press = this.emptyPress;
		this.emptyPress = undefined;
		if (press) {
			const rect = (e.target as HTMLElement | null)?.getBoundingClientRect?.();
			const x = e.clientX - (rect?.left ?? 0);
			const y = e.clientY - (rect?.top ?? 0);
			const now = performance.now();
			const isTap =
				Math.hypot(x - press.x, y - press.y) < TAP_SLOP &&
				now - press.t < TAP_MS;
			if (isTap && now - this.lastEmptyTap < DOUBLE_TAP_MS) {
				this.lastEmptyTap = 0;
				this.camera.fitWorld();
			} else if (isTap) this.lastEmptyTap = now;
		}
		// Re-enable grabbing after Matter has seen the release.
		setTimeout(() => this.allowGrab(true), 0);
	}

	private allowGrab(yes: boolean): void {
		this.mouseConstraint.collisionFilter.mask = yes ? GRAB_ALL : 0;
		if (!yes && this.mouseConstraint.body) {
			const held = this.world.entityOfBody(this.mouseConstraint.body);
			if (held) this.world.setGhost(held, false);
			this.mouseConstraint.constraint.bodyB = null;
			(this.mouseConstraint as { body: Matter.Body | null }).body = null;
		}
	}

	private release(body: Matter.Body): void {
		const entity = this.world.entityOfBody(body);
		if (!entity) return;
		this.world.setGhost(entity, false);
		const p = this.mouse.absolute;
		const moved = Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y);
		const now = performance.now();

		if (moved < TAP_SLOP && now - this.dragStart.t < TAP_MS) {
			const last = this.lastTap;
			if (last && last.entityId === entity.id && now - last.t < DOUBLE_TAP_MS) {
				this.lastTap = undefined;
				this.world.split(entity, body);
			} else {
				this.lastTap = { entityId: entity.id, t: now };
				this.onTap(entity, body);
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
