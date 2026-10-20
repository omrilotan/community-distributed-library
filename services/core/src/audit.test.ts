import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { as, DANA, NOA, SAM } from "../test/api.ts";
import { describe as describeAction } from "./audit.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";
const setRole = (member: string, role: string) =>
	env.DB.prepare(
		"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(role, member, FINCH)
		.run();

afterEach(async () => {
	await setRole(DANA, "moderator");
	await setRole(NOA, "member");
});

describe("the moderation log", () => {
	it("names the kind of change and what it was done to", () => {
		expect(
			describeAction(
				"POST",
				"/v1/admin/members/:id/role",
				"/v1/admin/members/01J0MEMBER0000000000SAM00/role",
			),
		).toEqual({
			action: "POST /v1/admin/members/:id/role",
			target: "01J0MEMBER0000000000SAM00",
		});
		expect(
			describeAction(
				"DELETE",
				"/v1/admin/tags/:slug",
				"/v1/admin/tags/genre%3Apoems",
			),
		).toEqual({ action: "DELETE /v1/admin/tags/:slug", target: "genre:poems" });
	});

	it("records a moderator's change, for the admin's eyes only", async () => {
		await setRole(NOA, "moderator");
		const made = await as(NOA).post("/v1/admin/tags", {
			namespace: "genre",
			value: "logged-shelf",
			labels: { en: "Logged", he: "נרשם" },
		});
		expect(made.status).toBe(201);
		// Nothing is written for a refusal.
		await as(SAM).post("/v1/admin/tags", {
			namespace: "genre",
			value: "not-allowed",
			labels: { en: "No", he: "לא" },
		});

		expect((await as(NOA).get("/v1/admin/log")).status).toBe(403);
		await setRole(DANA, "admin");
		const log = await as(DANA).get("/v1/admin/log");
		expect(log.status).toBe(200);
		expect(log.body.total).toBe(1);
		expect(log.body.entries[0]).toMatchObject({
			actor: { id: NOA, displayName: "Noa" },
			action: "POST /v1/admin/tags",
		});
		expect(log.body.entries[0].details).toContain("logged-shelf");
	});
});
