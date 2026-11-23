/**
 * Draws the home-screen icon and the link-preview card with the game's own
 * atoms, for screenshotting into public/. Open /scripts/art.html?kind=icon
 * (square viewport) or ?kind=card (1200×630) on the dev server.
 */
import { type Element, elementInfo } from "../src/chemistry/elements";
import { drawAtom } from "../src/render/textures";

const kind = new URLSearchParams(location.search).get("kind") ?? "icon";
const w = window.innerWidth;
const h = window.innerHeight;
const dpr = window.devicePixelRatio || 1;
const canvas = document.createElement("canvas");
canvas.width = w * dpr;
canvas.height = h * dpr;
canvas.style.width = `${w}px`;
canvas.style.height = `${h}px`;
document.body.append(canvas);
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
ctx.scale(dpr, dpr);

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function glow(el: Element, x: number, y: number, r: number, alpha = 0.55) {
	const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.9);
	const c = hex(elementInfo(el).glow);
	g.addColorStop(0, c);
	g.addColorStop(0.25, `${c}73`);
	g.addColorStop(0.6, `${c}1f`);
	g.addColorStop(1, `${c}00`);
	ctx.save();
	ctx.globalCompositeOperation = "lighter";
	ctx.globalAlpha = alpha;
	ctx.fillStyle = g;
	ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
	ctx.restore();
}

function atom(el: Element, x: number, y: number, r: number, alpha = 1) {
	ctx.save();
	ctx.globalAlpha = alpha;
	glow(el, x, y, r, 0.55 * alpha);
	drawAtom(ctx, el, x, y, r, r / 20);
	ctx.restore();
}

function bond(ax: number, ay: number, bx: number, by: number, width: number) {
	ctx.save();
	ctx.strokeStyle = "rgba(200, 225, 255, 0.4)";
	ctx.lineWidth = width;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(ax, ay);
	ctx.lineTo(bx, by);
	ctx.stroke();
	ctx.restore();
}

/** A water molecule: O at (x, y), the two H at the real 104.5° apart. */
function water(x: number, y: number, s: number) {
	const half = (104.5 / 2) * (Math.PI / 180);
	const len = s * 1.55;
	const hs = [-1, 1].map((side) => ({
		x: x + Math.sin(half) * len * side,
		y: y + Math.cos(half) * len,
	}));
	for (const p of hs) bond(x, y, p.x, p.y, s * 0.12);
	for (const p of hs) atom("H", p.x, p.y, s * 0.62);
	atom("O", x, y, s);
}

ctx.fillStyle = "#000";
ctx.fillRect(0, 0, w, h);

if (kind === "icon") {
	const s = Math.min(w, h);
	const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, s * 0.75);
	bg.addColorStop(0, "#0d1a2b");
	bg.addColorStop(1, "#000");
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, w, h);
	water(w / 2, h * 0.443, s * 0.2);
} else {
	// A few strays drifting behind, then the molecule and the name.
	const strays: [Element, number, number, number][] = [
		["C", 0.07, 0.18, 22],
		["N", 0.33, 0.1, 18],
		["Na", 0.12, 0.82, 20],
		["Cl", 0.4, 0.9, 19],
		["Fe", 0.93, 0.12, 18],
		["Ca", 0.95, 0.86, 21],
		["H", 0.55, 0.08, 14],
		["O", 0.6, 0.94, 16],
		["Si", 0.03, 0.5, 17],
	];
	for (const [el, fx, fy, r] of strays) atom(el, fx * w, fy * h, r, 0.55);
	water(w * 0.27, h * 0.45, h * 0.17);
	ctx.fillStyle = "rgba(255,255,255,0.94)";
	ctx.textBaseline = "alphabetic";
	ctx.font = `700 ${h * 0.17}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
	ctx.fillText("Elements", w * 0.5, h * 0.5);
	ctx.fillStyle = "#4fc3ff";
	ctx.font = `500 ${h * 0.058}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
	ctx.fillText("A zen chemistry sandbox", w * 0.505, h * 0.62);
	ctx.fillStyle = "rgba(255,255,255,0.58)";
	ctx.font = `400 ${h * 0.042}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
	ctx.fillText("Drag atoms together. Grow crystals,", w * 0.505, h * 0.72);
	ctx.fillText("set off reactions.", w * 0.505, h * 0.78);
}
document.body.dataset.ready = "1";
