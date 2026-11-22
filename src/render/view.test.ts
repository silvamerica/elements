import { describe, expect, it } from "vitest";
import { screenToWorld } from "./view";

describe("screenToWorld", () => {
	it("is identity at zoom 1 with no pan", () => {
		expect(screenToWorld({ x: 120, y: 80 }, 0, 0, 1)).toEqual({
			x: 120,
			y: 80,
		});
	});

	it("adds the pan offset", () => {
		expect(screenToWorld({ x: 120, y: 80 }, 1000, 500, 1)).toEqual({
			x: 1120,
			y: 580,
		});
	});

	it("divides by zoom", () => {
		expect(screenToWorld({ x: 200, y: 100 }, 1000, 500, 2)).toEqual({
			x: 1100,
			y: 550,
		});
		expect(screenToWorld({ x: 200, y: 100 }, 0, 0, 0.5)).toEqual({
			x: 400,
			y: 200,
		});
	});
});
