import type { WorldSnapshot } from "../world/world";

/** Everything that makes one browser's world its own. */
export interface SaveGame {
	version: 1;
	seed: number;
	/** Where the seeded random sequence has got to. */
	rngState: number;
	/** Which environment the seed picked. */
	worldKind: string;
	world: WorldSnapshot;
	/** Shelf keys: "m:<recipe id>" and "s:<recipe id>:<tier name>". */
	discovered: string[];
	/** Where the camera was looking (absent in older saves). */
	camera?: { x: number; y: number; zoom: number };
}

export const SAVE_KEY = "elements.save.v1";
/** Where saves lived before the project was renamed from Water; read once, then moved. */
const OLD_SAVE_KEY = "water.save.v1";

/** Minimal storage surface, so tests can pass a Map-backed fake. */
export interface KeyValue {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** The saved game, or undefined if there isn't one or it can't be read. */
export function readSave(store: KeyValue | undefined): SaveGame | undefined {
	try {
		const raw = store?.getItem(SAVE_KEY) ?? store?.getItem(OLD_SAVE_KEY);
		if (!raw) return undefined;
		const s = JSON.parse(raw) as Partial<SaveGame>;
		if (
			s.version !== 1 ||
			typeof s.seed !== "number" ||
			typeof s.rngState !== "number" ||
			typeof s.worldKind !== "string" ||
			!s.world ||
			!Array.isArray(s.world.entities) ||
			!Array.isArray(s.discovered)
		)
			return undefined;
		const cam = s.camera;
		if (
			cam &&
			![cam.x, cam.y, cam.zoom].every(
				(v) => typeof v === "number" && Number.isFinite(v),
			)
		)
			delete s.camera;
		return s as SaveGame;
	} catch {
		return undefined;
	}
}

/** Write the game; storage can be full or blocked, and play goes on either way. */
export function writeSave(
	store: KeyValue | undefined,
	save: SaveGame,
): boolean {
	try {
		store?.setItem(SAVE_KEY, JSON.stringify(save));
		store?.removeItem(OLD_SAVE_KEY);
		return !!store;
	} catch {
		return false;
	}
}

export function clearSave(store: KeyValue | undefined): void {
	try {
		store?.removeItem(SAVE_KEY);
		store?.removeItem(OLD_SAVE_KEY);
	} catch {
		// nothing to clear
	}
}

/** localStorage, if this browser lets us have it. */
export function browserStore(): KeyValue | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}
