import type { Point } from "../world/events";

/** Where the camera is looking: world point at the screen centre, and zoom. */
export interface CameraView {
	x: number;
	y: number;
	zoom: number;
}

/** The view as Matter's mouse wants it: world = screen × scale + offset. */
export function mouseTransform(left: number, top: number, zoom: number) {
	return { offset: { x: left, y: top }, scale: { x: 1 / zoom, y: 1 / zoom } };
}

export function screenToWorld(
	p: Point,
	left: number,
	top: number,
	zoom: number,
): Point {
	const t = mouseTransform(left, top, zoom);
	return { x: p.x * t.scale.x + t.offset.x, y: p.y * t.scale.y + t.offset.y };
}
