import type { World } from "../world/world";

/**
 * A way to play. The engine (world, input, renderer) is shared; a mode decides
 * what appears and when, and listens to world events for any goals it keeps.
 */
export interface Mode {
	readonly name: string;
	/** `fresh` is false when the board was restored from a save. */
	start(world: World, fresh?: boolean): void;
	update(dtMs: number): void;
	stop(): void;
}
