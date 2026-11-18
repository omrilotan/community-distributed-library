import { describe, expect, it, vi } from "vitest";
import {
	drawSign,
	FOLDS,
	pdfWithImage,
	SHEET,
	whenLine,
	wrap,
} from "./sign.ts";

describe("when the sign says the link works", () => {
	const words = {
		todayOnly: (day: string) => `Today only · ${day}`,
		joinBy: (day: string) => `Join by ${day}`,
		day: (seconds: number) =>
			new Date(seconds * 1000).toISOString().slice(0, 10),
	};
	const midnight = Date.UTC(2026, 10, 19) / 1000;

	it("names the one day of an event's link", () => {
		expect(
			whenLine({ startsAt: midnight, expiresAt: midnight + 86_400 }, words),
		).toBe("Today only · 2026-11-19");
	});

	it("names the last day of a link that runs for days", () => {
		expect(
			whenLine({ startsAt: null, expiresAt: midnight + 86_400 }, words),
		).toBe("Join by 2026-11-19");
	});
});

describe("wrapping words on the sign", () => {
	const measure = (text: string) => text.length * 10;

	it("breaks between words, and cuts what will not fit", () => {
		expect(wrap(measure, "a very long library name", 100, 3)).toEqual([
			"a very",
			"long",
			"library\u2026",
		]);
		expect(wrap(measure, "one two three four five", 90, 2)).toEqual([
			"one two",
			"three…",
		]);
		expect(wrap(measure, "short", 100, 2)).toEqual(["short"]);
	});
});

describe("the folded sheet", () => {
	/** A canvas that only notes what was written on it and how it was turned. */
	function recorder() {
		const texts: string[] = [];
		const rotations: number[] = [];
		const ctx = new Proxy(
			{},
			{
				get: (_, key) => {
					if (key === "fillText") return (text: string) => texts.push(text);
					if (key === "rotate") return (angle: number) => rotations.push(angle);
					if (key === "measureText")
						return (text: string) => ({ width: text.length * 40 });
					return () => undefined;
				},
				set: () => true,
			},
		) as unknown as CanvasRenderingContext2D;
		return { ctx, texts, rotations };
	}

	it("puts the same face on both slopes, one upside down, and the base below", () => {
		vi.stubGlobal("Path2D", class {});
		const { ctx, texts, rotations } = recorder();
		drawSign(ctx, {
			url: "https://library.test/join?invite=abc",
			colour: "#16a085",
			rtl: false,
			words: {
				name: "Our Street",
				tagline: "Books between neighbours",
				scan: "Scan to join",
				when: "Today only · Thursday 19 Nov",
				foldHint: "Fold along the dashed lines",
				madeWith: "Community Distributed Library",
				glue: "Glue",
			},
		});
		vi.unstubAllGlobals();
		const count = (text: string) => texts.filter((t) => t === text).length;
		expect(count("Our Street")).toBe(2);
		expect(count("Books between neighbours")).toBe(2);
		expect(count("Scan to join")).toBe(2);
		expect(count("Today only · Thursday 19 Nov")).toBe(2);
		expect(count("Community Distributed Library")).toBe(1);
		expect(count("Glue")).toBe(1);
		expect(texts.indexOf("Fold along the dashed lines")).toBeLessThan(
			texts.indexOf("Our Street"),
		);
		expect(rotations).toEqual([Math.PI]);
	});

	it("fills A4 with two faces between two end flaps that make the base", () => {
		const { face, flap } = FOLDS;
		expect(2 * face + 2 * flap).toBe(SHEET.height);
		const mm = (dots: number) => dots / (300 / 25.4);
		expect(Math.round(mm(face))).toBe(108);
		expect(Math.round(mm(flap))).toBe(40);
	});
});

describe("the sign as a PDF", () => {
	it("is one A4 page holding the picture, with a table that points true", () => {
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
		const pdf = pdfWithImage(jpeg, SHEET);
		const text = new TextDecoder("latin1").decode(pdf);
		expect(text.startsWith("%PDF-1.4")).toBe(true);
		expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
		expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
		expect(text).toContain(`/Width ${SHEET.width} /Height ${SHEET.height}`);
		expect(text).toContain("/Filter /DCTDecode /Length 9");

		// Each object sits where the cross-reference table says it does.
		const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
		expect(text.slice(startxref, startxref + 4)).toBe("xref");
		const offsets = [
			...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g),
		].map((m) => Number(m[1]));
		expect(offsets).toHaveLength(5);
		offsets.forEach((offset, i) =>
			expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`),
		);
	});
});
