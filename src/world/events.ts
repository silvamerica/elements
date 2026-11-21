import mitt from "mitt";
import type { Element } from "../chemistry/elements";
import type { Recipe } from "../chemistry/recipes";
import type { Tier } from "../chemistry/structures";

export interface Point {
	x: number;
	y: number;
}

/** Everything the world reports. Modes, the renderer and the shelf listen here. */
export type WorldEvents = {
	spawned: { entityId: number; element: Element; at: Point };
	bonded: { entityId: number; at: Point };
	snapped: { entityId: number; recipe: Recipe; at: Point };
	fizzled: { at: Point };
	joined: { entityId: number; recipe: Recipe; count: number; at: Point };
	tierUp: { entityId: number; recipe: Recipe; tier: Tier; at: Point };
	split: { at: Point };
};

export const createBus = () => mitt<WorldEvents>();
export type Bus = ReturnType<typeof createBus>;
