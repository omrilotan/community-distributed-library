import { describe, expect, it } from "vitest";
import { safePath } from "./safe-path.ts";

describe("safePath", () => {
	it("keeps our own paths", () => {
		expect(safePath("/works/1?x=1#top")).toBe("/works/1?x=1#top");
		expect(safePath("/")).toBe("/");
		// A tab is dropped as a browser would drop it: what is left is a path here.
		expect(safePath("/\tevil.example")).toBe("/evil.example");
	});

	it("refuses anything a browser would take to another host", () => {
		for (const input of [
			"//evil.example",
			"/.//evil.example",
			"/%2e//evil.example",
			"/a/..//evil.example",
			"/\\evil.example",
			"/\t/evil.example",
			"https://evil.example",
			"javascript:alert(1)",
			"evil",
			"",
			undefined,
			null,
		]) {
			expect(safePath(input, "/home")).toBe("/home");
		}
	});
});
