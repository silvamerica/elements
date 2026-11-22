/**
 * mulberry32: a tiny seeded PRNG whose whole state is one uint32, so a world
 * can save exactly where its random sequence is and carry on after a reload.
 */
export class Rng {
	constructor(public state: number) {
		this.state = state >>> 0;
	}

	next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** A bound function for APIs that want `() => number`. */
	readonly fn = (): number => this.next();
}

/** A fresh, unpredictable seed for a new world. */
export function newSeed(): number {
	const a = new Uint32Array(1);
	crypto.getRandomValues(a);
	return a[0] ?? 1;
}
