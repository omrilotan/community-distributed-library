import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, WORK } from "../test/api.ts";

const shelves = (query = "") => api(null, "GET", `/v1/public/shelves${query}`);

describe("the shelves for somebody not signed in", () => {
	it("lists the books without asking who is looking", async () => {
		const { status, body } = await shelves();
		expect(status).toBe(200);
		expect(body.total).toBe(1);
		expect(body.results).toEqual([
			{
				work: { id: WORK, title: "Oz", authors: ["Baum"] },
				edition: { title: "Oz", coverUrl: null },
			},
		]);
	});

	it("says nothing about who has a book, where, or whether it is free", async () => {
		const text = JSON.stringify((await shelves()).body);
		for (const word of [
			"Dana",
			"owner",
			"copies",
			"distance",
			"nearest",
			"available",
			"area",
		])
			expect(text).not.toContain(word);
	});

	it("searches, filters by tag and orders by title", async () => {
		expect((await shelves("?q=baum")).body.total).toBe(1);
		expect((await shelves("?q=nothing-like-it")).body.total).toBe(0);
		expect((await shelves("?tags=language:he")).body.total).toBe(0);
		expect((await shelves("?sort=title")).status).toBe(200);
		// Nearest first needs a place: refused rather than guessed at.
		expect((await shelves("?sort=distance")).status).toBe(422);
	});

	it("leaves out a suspended member's books", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET status = 'suspended' WHERE member_id = '01J0MEMBER00000000000DANA'",
		).run();
		try {
			expect((await shelves()).body.total).toBe(0);
		} finally {
			await env.DB.prepare(
				"UPDATE memberships SET status = 'active' WHERE member_id = '01J0MEMBER00000000000DANA'",
			).run();
		}
	});

	it("offers the tag vocabulary to filter by", async () => {
		const { status, body } = await api(null, "GET", "/v1/public/tags");
		expect(status).toBe(200);
		expect(Array.isArray(body.namespaces)).toBe(true);
		expect(Array.isArray(body.tags)).toBe(true);
	});
});
