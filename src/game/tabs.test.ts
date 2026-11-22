import { describe, expect, it } from "vitest";
import { type Channel, TabLock, type TabMessage } from "./tabs";

/** An in-memory BroadcastChannel: every channel hears the others, asynchronously. */
function bus() {
	const members: Channel[] = [];
	return () => {
		const ch: Channel = {
			onmessage: null,
			postMessage(msg: TabMessage) {
				for (const other of members)
					if (other !== ch)
						setTimeout(() => other.onmessage?.({ data: msg }), 1);
			},
		};
		members.push(ch);
		return ch;
	};
}

describe("TabLock", () => {
	it("lets the first tab own the world and tells a second it's taken", async () => {
		const open = bus();
		const a = new TabLock(open());
		expect(await a.claim()).toBe(true);
		const b = new TabLock(open());
		expect(await b.claim()).toBe(false);
		expect(a.owned).toBe(true);
	});

	it("hands over cleanly: the owner saves, lets go and is told it lost", async () => {
		const open = bus();
		const a = new TabLock(open());
		await a.claim();
		const events: string[] = [];
		a.onYield = () => events.push("saved");
		a.onLost = () => events.push("lost");
		const b = new TabLock(open());
		await b.claim();
		await b.takeOver();
		expect(events).toEqual(["saved", "lost"]);
		expect(a.owned).toBe(false);
		expect(b.owned).toBe(true);
		const c = new TabLock(open());
		expect(await c.claim()).toBe(false);
	});

	it("takes over anyway if the old owner has gone quiet", async () => {
		const open = bus();
		const b = new TabLock(open());
		await b.takeOver();
		expect(b.owned).toBe(true);
	});
});
