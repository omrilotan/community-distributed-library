import { describe, expect, it } from "vitest";
import { backAfterSignIn, safePath } from "./safe-path.ts";

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

describe("backAfterSignIn", () => {
	it("comes back to an assistant's consent screen", () => {
		const here = "/oauth/consent?req=0b7c1e52-3f0a-4d4e-9c8a-2a1f5e6d7c8b";
		expect(backAfterSignIn(here)).toBe(here);
	});

	it("goes nowhere else, on this site or off it", () => {
		for (const input of [
			"/logout",
			"/view-as",
			"/api/auth/exchange",
			"/oauth/consentx?req=abc",
			"/oauth/consent",
			"/oauth/consent?req=abc",
			"/oauth/consent?req=0b7c1e52-3f0a-4d4e-9c8a-2a1f5e6d7c8b&next=/logout",
			"//evil.example/oauth/consent?req=abc",
			"https://evil.example/oauth/consent?req=abc",
			"/\\evil.example/oauth/consent?req=abc",
			null,
		])
			expect(backAfterSignIn(input)).toBeNull();
	});
});
