import type { Application } from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { Point } from "../world/events";
import { type CameraView, mouseTransform, screenToWorld } from "./view";

const MAX_ZOOM = 3;

/**
 * Pan and zoom over a world bigger than the screen, via pixi-viewport:
 * drag empty space or two-finger swipe to pan, pinch or wheel to zoom,
 * with momentum, clamped to the world's edges.
 */
export class Camera {
	readonly viewport: Viewport;

	constructor(
		app: Application,
		private readonly worldWidth: number,
		private readonly worldHeight: number,
	) {
		this.viewport = new Viewport({
			screenWidth: window.innerWidth,
			screenHeight: window.innerHeight,
			worldWidth,
			worldHeight,
			events: app.renderer.events,
		});
		this.viewport
			.drag({ wheel: false })
			.pinch()
			.wheel({ smooth: 4 })
			.decelerate({ friction: 0.92 })
			.clamp({ direction: "all", underflow: "center" });
		this.applyZoomLimits();
		app.stage.addChild(this.viewport);
		this.viewport.setZoom(1);
		this.viewport.moveCenter(worldWidth / 2, worldHeight / 2);
	}

	resize(screenWidth: number, screenHeight: number): void {
		this.viewport.resize(
			screenWidth,
			screenHeight,
			this.worldWidth,
			this.worldHeight,
		);
		this.applyZoomLimits();
	}

	/** Zoom right out so the whole world fits. */
	fitWorld(): void {
		this.viewport.animate({
			scale: this.fitScale(),
			position: { x: this.worldWidth / 2, y: this.worldHeight / 2 },
			time: 450,
			ease: "easeInOutSine",
		});
	}

	pauseDrag(): void {
		this.viewport.plugins.pause("drag");
		this.viewport.plugins.pause("decelerate");
	}

	resumeDrag(): void {
		this.viewport.plugins.resume("drag");
		this.viewport.plugins.resume("decelerate");
	}

	toWorld(screen: Point): Point {
		return screenToWorld(
			screen,
			this.viewport.left,
			this.viewport.top,
			this.viewport.scaled,
		);
	}

	/** Matter's mouse transform for the current view. */
	mouseTransform() {
		return mouseTransform(
			this.viewport.left,
			this.viewport.top,
			this.viewport.scaled,
		);
	}

	/** The part of the world currently on screen. */
	get visibleRect(): { x: number; y: number; width: number; height: number } {
		const v = this.viewport;
		return {
			x: v.left,
			y: v.top,
			width: v.worldScreenWidth,
			height: v.worldScreenHeight,
		};
	}

	get view(): CameraView {
		const c = this.viewport.center;
		return {
			x: Math.round(c.x),
			y: Math.round(c.y),
			zoom: Math.round(this.viewport.scaled * 1000) / 1000,
		};
	}

	set view(v: CameraView) {
		this.viewport.setZoom(
			Math.max(this.fitScale(), Math.min(MAX_ZOOM, v.zoom)),
			true,
		);
		this.viewport.moveCenter(v.x, v.y);
	}

	private fitScale(): number {
		return Math.min(
			this.viewport.screenWidth / this.worldWidth,
			this.viewport.screenHeight / this.worldHeight,
		);
	}

	private applyZoomLimits(): void {
		this.viewport.clampZoom({ minScale: this.fitScale(), maxScale: MAX_ZOOM });
	}
}
