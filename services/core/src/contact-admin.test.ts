import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { api, as, DANA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";
const role = (value: string) =>
	env.DB.prepare(
		"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(value, DANA, FINCH)
		.run();

afterEach(() => role("moderator"));

describe("messages to the library", () => {
	it("are the admin's to read, not a moderator's", async () => {
		await as(SAM).post("/v1/contact", {
			topic: "complaint",
			body: "About a moderator",
		});
		await api(null, "POST", "/v1/contact", {
			topic: "data",
			body: "Delete my data",
			email: "visitor@example.com",
		});

		expect((await as(DANA).get("/v1/admin/contact")).status).toBe(403);
		await role("admin");
		const page = await as(DANA).get("/v1/admin/contact?page=1");
		expect(page.status).toBe(200);
		expect(page.body).toMatchObject({ page: 1, pages: 1, total: 2 });
		expect(page.body.messages[0]).toMatchObject({
			topic: "data",
			email: "visitor@example.com",
			member: null,
		});
		expect(page.body.messages[1]).toMatchObject({
			topic: "complaint",
			member: { id: SAM, displayName: "Sam" },
		});

		const id = page.body.messages[0].id as string;
		expect(
			(await as(DANA).post(`/v1/admin/contact/${id}/handled`)).status,
		).toBe(204);
		const after = await as(DANA).get("/v1/admin/contact");
		expect(after.body.messages[0].handledAt).toBeGreaterThan(0);
	});
});
