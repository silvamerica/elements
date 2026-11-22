import { describe, expect, it } from "vitest";
import { REACTIONS } from "../chemistry/reactions";
import { howTo } from "./tray";

const r = (id: string) => {
	const found = REACTIONS.find((x) => x.id === id);
	if (!found) throw new Error(id);
	return found;
};

describe("howTo", () => {
	it("says what to drop on and what else must be nearby", () => {
		expect(howTo(r("methane-burns"), "CH4")).toBe(
			"Drop on O₂, with another O₂ nearby",
		);
		expect(howTo(r("methane-burns"), "O2")).toBe(
			"Drop on CH₄, with another O₂ nearby",
		);
		expect(howTo(r("sodium-water"), "Na")).toBe(
			"Drop on H₂O, with another H₂O + another Na nearby",
		);
		expect(howTo(r("ammonium-chloride"), "ClH")).toBe("Drop on NH₃");
	});

	it("handles same-kind partners, catalysts and lone reactants", () => {
		expect(howTo(r("peroxide-breaks"), "H2O2")).toBe(
			"Drop on another H₂O₂, near MnO₂",
		);
		expect(howTo(r("peroxide-breaks"), "MnO2")).toBe("Put it near 2 H₂O₂");
		expect(howTo(r("lime-kiln"), "CCaO3")).toBe("Heat it");
	});
});
