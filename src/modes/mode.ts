import type { World } from "../world/world";

/**
 * A way to play. The engine (world, input, renderer) is shared; a mode decides
 * what appears and when, and listens to world events for any goals it keeps.
 */
export interface Mode {
	readonly name: string;
	start(world: World): void;
	update(dtMs: number): void;
	stop(): void;
}
