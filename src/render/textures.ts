import { Texture } from "pixi.js";
import { type Element, elementInfo } from "../chemistry/elements";

/** Texture size multiplier so atoms stay crisp on retina screens. */
const SCALE = 3;

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
	const c = document.createElement("canvas");
	c.width = c.height = size;
	const ctx = c.getContext("2d");
	if (!ctx) throw new Error("no 2d context");
	return [c, ctx];
}

/** A soft white radial falloff, tinted per use for glows and halos. */
export function glowTexture(): Texture {
	const size = 128;
	const [c, ctx] = canvas(size);
	const g = ctx.createRadialGradient(
		size / 2,
		size / 2,
		0,
		size / 2,
		size / 2,
		size / 2,
	);
	g.addColorStop(0, "rgba(255,255,255,1)");
	g.addColorStop(0.25, "rgba(255,255,255,0.45)");
	g.addColorStop(0.6, "rgba(255,255,255,0.12)");
	g.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	return Texture.from(c);
}

/** A thin white ring, for snap and tier-up bursts. */
export function ringTexture(): Texture {
	const size = 128;
	const [c, ctx] = canvas(size);
	ctx.strokeStyle = "white";
	ctx.lineWidth = 4;
	ctx.shadowColor = "white";
	ctx.shadowBlur = 8;
	ctx.beginPath();
	ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
	ctx.stroke();
	return Texture.from(c);
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

const atomCache = new Map<Element, Texture>();

/** The baked sprite for an element: shaded ball, rim and symbol, drawn at radius × SCALE. Made on first use. */
export function atomTexture(el: Element): Texture {
	const cached = atomCache.get(el);
	if (cached) return cached;
	const info = elementInfo(el);
	const r = info.radius * SCALE;
	const pad = 4 * SCALE;
	const [c, ctx] = canvas(2 * (r + pad));
	const mid = r + pad;

	const shade = ctx.createRadialGradient(
		mid - r * 0.35,
		mid - r * 0.4,
		r * 0.1,
		mid,
		mid,
		r,
	);
	shade.addColorStop(0, "rgba(255,255,255,0.55)");
	shade.addColorStop(0.35, hex(info.color));
	shade.addColorStop(1, shadeDown(info.color));
	ctx.fillStyle = shade;
	ctx.beginPath();
	ctx.arc(mid, mid, r, 0, Math.PI * 2);
	ctx.fill();

	ctx.strokeStyle = hex(info.glow);
	ctx.globalAlpha = 0.7;
	ctx.lineWidth = 1.5 * SCALE;
	ctx.stroke();
	ctx.globalAlpha = 1;

	ctx.fillStyle =
		luminance(info.color) > 0.6 ? "#2a3040" : "rgba(255,255,255,0.94)";
	const size = el.length > 1 ? r * 0.78 : r * 0.95;
	ctx.font = `600 ${Math.round(size)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(el, mid, mid + r * 0.06);
	const tex = Texture.from(c);
	atomCache.set(el, tex);
	return tex;
}

function luminance(color: number): number {
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const ATOM_TEXTURE_SCALE = SCALE;
export const ATOM_TEXTURE_PAD = 4;

function shadeDown(color: number): string {
	const r = ((color >> 16) & 255) * 0.45;
	const g = ((color >> 8) & 255) * 0.45;
	const b = (color & 255) * 0.45;
	return `rgb(${r | 0},${g | 0},${b | 0})`;
}
