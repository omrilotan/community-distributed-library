import { describe, expect, it } from "vitest";
import { as, SAM } from "../test/api.ts";

describe("how many books match", () => {
	it("is said on browse, whatever the page holds", async () => {
		const whole = await as(SAM).get("/v1/browse?limit=240");
		expect(whole.body.total).toBe(whole.body.results.length);
		const page = await as(SAM).get("/v1/browse?limit=1");
		expect(page.body.results).toHaveLength(Math.min(1, whole.body.total));
		expect(page.body.total).toBe(whole.body.total);
	});

	it("is said on search too, not the page's length", async () => {
		const title = `Countable ${Date.now()}`;
		await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const found = await as(SAM).get(
			`/v1/search?q=${encodeURIComponent(title)}&showMine=1&limit=1`,
		);
		expect(found.body.total).toBe(1);
	});
});
