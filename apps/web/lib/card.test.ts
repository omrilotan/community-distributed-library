import { describe, expect, it } from "vitest";
import type { Font } from "./font.ts";
import { wrap, type Face } from "./card.ts";

/** Every character one unit wide, so widths are character counts. */
const mono = {
	unitsPerEm: 1,
	glyph: () => 1,
	advance: () => 1,
} as unknown as Font;
const face: Face = { hebrew: mono, latin: mono };

describe("a title on the link card", () => {
	it("wraps words onto lines that fit", () => {
		expect(wrap("one two three", face, 1, 7, 3)).toEqual({
			lines: ["one two", "three"],
			cut: false,
		});
	});

	it("breaks a word wider than the column instead of overflowing", () => {
		const { lines } = wrap("Donaudampfschifffahrt ok", face, 1, 8, 4);
		expect(lines).toEqual(["Donaudam", "pfschiff", "fahrt ok"]);
		for (const line of lines) expect(line.length).toBeLessThanOrEqual(8);
	});

	it("cuts the last line short when there are too many", () => {
		const { lines, cut } = wrap("aaaa bbbb cccc dddd", face, 1, 4, 2);
		expect(cut).toBe(true);
		expect(lines).toEqual(["aaaa", "bbb…"]);
	});

	it("keeps a letter's marks with it when it breaks a word", () => {
		const title = "שָׁלוֹםשָׁלוֹם";
		const { lines } = wrap(title, face, 1, 3, 10);
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) expect(line).not.toMatch(/^\p{M}/u);
		expect(lines.join("")).toBe(title);
	});
});
