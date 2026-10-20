import { describe, expect, it } from "vitest";
import { accentTokens, contrast } from "@cdl/contracts";
import { accentCss } from "./accent.ts";

describe("a library's colour", () => {
	it("needs no style sheet for the house green", () => {
		expect(accentCss(null)).toBeNull();
	});

	it("is readable whatever the admin picks", () => {
		for (const pick of [
			"#ffeb3b",
			"#ffffff",
			"#000000",
			"#e91e63",
			"#3366ff",
			// The worst a sweep of every colour found in warning callouts.
			"#757515",
			"#090945",
			"#3f51b5",
			"#cddc39",
		]) {
			const { light, dark } = accentTokens(pick);
			expect(contrast(light.accent, "#f5f7f6")).toBeGreaterThanOrEqual(4.5);
			expect(contrast(light.accent, light.accentSoft)).toBeGreaterThanOrEqual(
				4.5,
			);
			expect(contrast(light.accent, light.accentInk)).toBeGreaterThanOrEqual(
				4.5,
			);
			expect(contrast(light.brand, "#f5f7f6")).toBeGreaterThanOrEqual(3);
			// Links in a warning callout.
			expect(contrast(light.accent, "#f5e7da")).toBeGreaterThanOrEqual(4.5);
			expect(contrast(dark.accent, "#33271d")).toBeGreaterThanOrEqual(4.5);
			expect(contrast(dark.accent, "#1b2120")).toBeGreaterThanOrEqual(4.5);
			expect(contrast(dark.accent, dark.accentSoft)).toBeGreaterThanOrEqual(
				4.5,
			);
			expect(contrast(dark.accent, dark.accentInk)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(dark.brand, "#131817")).toBeGreaterThanOrEqual(3);
		}
	});

	it("keeps a colour that already reads well", () => {
		expect(accentTokens("#3366ff").light.brand).toBe("#3366ff");
		expect(accentCss("#3366ff")).toContain("--brand:#3366ff;");
	});
});
