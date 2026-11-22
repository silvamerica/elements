/** The bit of BroadcastChannel the lock uses, so tests can pass a fake. */
export interface Channel {
	postMessage(msg: TabMessage): void;
	onmessage: ((ev: { data: TabMessage }) => void) | null;
}

export type TabMessage =
	| { type: "anyone"; from: string }
	| { type: "here"; from: string }
	| { type: "takeover"; from: string }
	| { type: "released"; from: string };

/** How long to wait for another tab to answer. */
const ASK_MS = 250;
const RELEASE_MS = 1500;

/**
 * Makes sure only one tab plays (and saves) the world at a time. A new tab
 * asks whether anyone has it; if so it waits to be told to take over. The
 * owner, asked to hand over, saves and lets go first.
 */
export class TabLock {
	owned = false;
	/** This tab lost the world to another one. */
	onLost: () => void = () => {};
	/** Called before handing over, so the latest state is saved. */
	onYield: () => void = () => {};
	private readonly id = Math.random().toString(36).slice(2);
	private waiting: ((msg: TabMessage) => void) | undefined;

	constructor(private readonly channel: Channel) {
		channel.onmessage = ({ data }) => this.receive(data);
	}

	/** Claim the world if no other tab has it. Resolves to whether we own it. */
	async claim(): Promise<boolean> {
		const answered = await this.ask(
			{ type: "anyone", from: this.id },
			"here",
			ASK_MS,
		);
		this.owned = !answered;
		return this.owned;
	}

	/** Ask the owning tab to let go, then own it (even if no one answers). */
	async takeOver(): Promise<void> {
		await this.ask({ type: "takeover", from: this.id }, "released", RELEASE_MS);
		this.owned = true;
	}

	private receive(msg: TabMessage): void {
		if (msg.from === this.id) return;
		this.waiting?.(msg);
		if (!this.owned) return;
		if (msg.type === "anyone")
			this.channel.postMessage({ type: "here", from: this.id });
		if (msg.type === "takeover") {
			this.onYield();
			this.owned = false;
			this.channel.postMessage({ type: "released", from: this.id });
			this.onLost();
		}
	}

	private ask(
		msg: TabMessage,
		reply: TabMessage["type"],
		ms: number,
	): Promise<boolean> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.waiting = undefined;
				resolve(false);
			}, ms);
			this.waiting = (m) => {
				if (m.type !== reply) return;
				clearTimeout(timer);
				this.waiting = undefined;
				resolve(true);
			};
			this.channel.postMessage(msg);
		});
	}
}

/** The real channel, or a do-nothing one where BroadcastChannel isn't available. */
export function tabChannel(): Channel {
	try {
		return new BroadcastChannel("water.tabs") as unknown as Channel;
	} catch {
		return { postMessage() {}, onmessage: null };
	}
}
