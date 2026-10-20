import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { as, DANA, NOA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";
const setRole = (member: string, role: string) =>
	env.DB.prepare(
		"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(role, member, FINCH)
		.run();

/** Dana moderates in the fixtures; each test puts the roles back. */
afterEach(async () => {
	await setRole(DANA, "moderator");
	await setRole(SAM, "member");
	await setRole(NOA, "member");
});

describe("moderators and the library's admin", () => {
	it("keeps roles the admin's to give: a moderator can only step down", async () => {
		expect(
			(
				await as(DANA).post(`/v1/admin/members/${SAM}/role`, {
					role: "moderator",
				})
			).status,
		).toBe(403);
		expect(
			(await as(DANA).post(`/v1/admin/members/${NOA}/role`, { role: "admin" }))
				.status,
		).toBe(403);
		await setRole(SAM, "admin");
		expect(
			(
				await as(SAM).post(`/v1/admin/members/${NOA}/role`, {
					role: "moderator",
				})
			).status,
		).toBe(204);
		// Noa, now a moderator, can hand the role back but not give it away.
		expect(
			(await as(NOA).post(`/v1/admin/members/${NOA}/role`, { role: "member" }))
				.status,
		).toBe(204);
	});

	it("gives the admin everything a moderator has", async () => {
		await setRole(SAM, "admin");
		expect((await as(SAM).get("/v1/admin/members")).status).toBe(200);
		expect((await as(SAM).get("/v1/me")).body.role).toBe("admin");
	});

	it("keeps an admin out of a moderator's reach", async () => {
		await setRole(SAM, "admin");
		expect(
			(await as(DANA).post(`/v1/admin/members/${SAM}/role`, { role: "member" }))
				.status,
		).toBe(403);
	});

	it("lets an admin appoint another, and never leaves the library without one", async () => {
		await setRole(SAM, "admin");
		expect(
			(
				await as(SAM).post(`/v1/admin/members/${SAM}/role`, {
					role: "moderator",
				})
			).status,
		).toBe(409);
		expect(
			(await as(SAM).post(`/v1/admin/members/${NOA}/role`, { role: "admin" }))
				.status,
		).toBe(204);
		expect(
			(
				await as(NOA).post(`/v1/admin/members/${SAM}/role`, {
					role: "moderator",
				})
			).status,
		).toBe(204);
	});
});
