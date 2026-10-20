import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, DANA, NOA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";

/** Dana brought Sam, Sam brought Noa. */
beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("UPDATE members SET invited_by = ? WHERE id = ?").bind(
			DANA,
			SAM,
		),
		env.DB.prepare("UPDATE members SET invited_by = ? WHERE id = ?").bind(
			SAM,
			NOA,
		),
	]);
});

afterEach(async () => {
	await env.DB.prepare(
		"UPDATE memberships SET role = 'moderator' WHERE member_id = ? AND community_id = ?",
	)
		.bind(DANA, FINCH)
		.run();
});

describe("a member's page", () => {
	it("shows a moderator who came in how, and who they brought", async () => {
		const page = await as(DANA).get(`/v1/admin/members/${SAM}`);
		expect(page.status).toBe(200);
		expect(page.body.member).toMatchObject({ id: SAM, displayName: "Sam" });
		expect(page.body.invitedBy).toEqual({ id: DANA, displayName: "Dana" });
		expect(page.body.invited).toEqual([
			expect.objectContaining({ id: NOA, displayName: "Noa" }),
		]);
		// Tracing the whole chain is the admin's.
		expect(page.body.trail).toBeNull();
		// So are addresses.
		expect(page.body.member.email).toBeNull();
		const list = await as(DANA).get("/v1/admin/members");
		expect(
			list.body.members.every(
				(member: { email: unknown }) => member.email === null,
			),
		).toBe(true);
	});

	it("traces the admin back to whoever started the chain", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const page = await as(DANA).get(`/v1/admin/members/${NOA}`);
		expect(page.body.trail.map((step: { id: string }) => step.id)).toEqual([
			NOA,
			SAM,
			DANA,
		]);
		expect(page.body.member.email).toBe("noa@example.com");
	});

	it("is for moderators, and only of their own community", async () => {
		expect((await as(SAM).get(`/v1/admin/members/${NOA}`)).status).toBe(403);
		expect(
			(await as(DANA).get("/v1/admin/members/01J0MEMBER0000000000NOBODY"))
				.status,
		).toBe(404);
	});
});

describe("invitations and suspensions", () => {
	it("lets the admin revoke everything a member could still bring in with", async () => {
		await as(SAM).post("/v1/invites", {});
		await as(SAM).post("/v1/invites", {});
		expect(
			(await as(DANA).post(`/v1/admin/members/${SAM}/invites/revoke`)).status,
		).toBe(403);
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const page = await as(DANA).get(`/v1/admin/members/${SAM}`);
		expect(page.body.openInvites).toHaveLength(2);
		const revoked = await as(DANA).post(
			`/v1/admin/members/${SAM}/invites/revoke`,
		);
		expect(revoked.body).toEqual({ revoked: 2 });
		expect(
			(await as(DANA).get(`/v1/admin/members/${SAM}`)).body.openInvites,
		).toEqual([]);
	});

	it("keeps moderators and the admin out of a moderator's reach", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'moderator' WHERE member_id = ? AND community_id = ?",
		)
			.bind(NOA, FINCH)
			.run();
		expect(
			(
				await as(DANA).post(`/v1/admin/members/${NOA}/status`, {
					status: "suspended",
				})
			).status,
		).toBe(403);
		// A plain member is still a moderator's to suspend.
		expect(
			(
				await as(DANA).post(`/v1/admin/members/${SAM}/status`, {
					status: "suspended",
				})
			).status,
		).toBe(204);
		await as(DANA).post(`/v1/admin/members/${SAM}/status`, {
			status: "active",
		});
		await env.DB.prepare(
			"UPDATE memberships SET role = 'member' WHERE member_id = ? AND community_id = ?",
		)
			.bind(NOA, FINCH)
			.run();
	});
});
