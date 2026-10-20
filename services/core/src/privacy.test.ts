import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { activeLoan, as, COPY_A, DANA, NOA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";
const setRole = (member: string, role: string) =>
	env.DB.prepare(
		"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(role, member, FINCH)
		.run();

afterEach(async () => {
	await setRole(DANA, "moderator");
	// Put back what an erasure took, so the fixtures stay the fixtures.
	await env.DB.prepare(
		`UPDATE members SET email = 'noa@example.com', display_name = 'Noa', deactivated_at = NULL,
		        area_label = 'Finchley Central', area_lat = 51.6, area_lng = -0.19
		  WHERE id = ?`,
	)
		.bind(NOA)
		.run();
	await env.DB.prepare(
		"UPDATE memberships SET status = 'active' WHERE member_id = ? AND community_id = ?",
	)
		.bind(NOA, FINCH)
		.run();
});

describe("a member's data", () => {
	it("is exported for the admin only, with what they wrote", async () => {
		const id = await activeLoan(NOA, DANA, COPY_A);
		await as(NOA).post(`/v1/loans/${id}/messages`, { body: "Mine to take" });
		expect(
			(await as(DANA).post(`/v1/admin/members/${NOA}/export`)).status,
		).toBe(403);
		await setRole(DANA, "admin");
		const out = await as(DANA).post(`/v1/admin/members/${NOA}/export`);
		expect(out.status).toBe(200);
		expect(out.body.member).toMatchObject({ email: "noa@example.com" });
		expect(out.body.loans).toHaveLength(1);
		expect(out.body.messages[0]).toMatchObject({ body: "Mine to take" });
		// Where they said they live, and everything else held about them.
		expect(out.body.member).toHaveProperty("area_lat");
		for (const part of [
			"signIns",
			"handoffsProposed",
			"moderation",
			"invitationsReceived",
			"emailsWaiting",
		])
			expect(Array.isArray(out.body[part])).toBe(true);
	});

	it("includes what they sent while signed out, by their address", async () => {
		await setRole(DANA, "admin");
		await env.DB.prepare(
			`INSERT INTO contact_messages (id, member_id, community_id, email, topic, body, created_at)
			 VALUES ('01J0CONTACT00000000000OUT1', NULL, ?, 'NOA@example.com', 'data', 'Signed out', 1)`,
		)
			.bind(FINCH)
			.run();
		const out = await as(DANA).post(`/v1/admin/members/${NOA}/export`);
		expect(out.body.messagesToTheLibrary).toEqual(
			expect.arrayContaining([expect.objectContaining({ body: "Signed out" })]),
		);
	});

	it("is erased on the admin's typed word, and not while a loan is open", async () => {
		await setRole(DANA, "admin");
		const id = await activeLoan(NOA, DANA, COPY_A);
		const refused = await as(DANA).post(`/v1/admin/members/${NOA}/erase`, {
			confirm: "Noa",
		});
		expect(refused.status).toBe(409);
		await as(NOA).post(`/v1/loans/${id}/returned`);
		await as(DANA).post(`/v1/loans/${id}/returned`);
		await env.DB.prepare(
			"UPDATE loans SET status = 'completed', closed_at = unixepoch() WHERE id = ?",
		)
			.bind(id)
			.run();

		expect(
			(await as(DANA).post(`/v1/admin/members/${NOA}/erase`, { confirm: "No" }))
				.status,
		).toBe(422);
		const done = await as(DANA).post(`/v1/admin/members/${NOA}/erase`, {
			confirm: "Noa",
		});
		expect(done.status).toBe(200);
		const row = await env.DB.prepare(
			"SELECT email, display_name, area_label, deactivated_at FROM members WHERE id = ?",
		)
			.bind(NOA)
			.first<{
				email: string;
				display_name: string;
				area_label: string | null;
				deactivated_at: number | null;
			}>();
		expect(row?.email).not.toContain("noa@");
		expect(row?.display_name).toBe("—");
		expect(row?.area_label).toBeNull();
		expect(row?.deactivated_at).toBeGreaterThan(0);
		// They can no longer be anybody here.
		expect((await as(NOA).get("/v1/me")).status).toBe(401);
		// The log says it happened, not whom it was about by name.
		const log = await as(DANA).get("/v1/admin/log");
		const entry = log.body.entries.find(
			(e: { action: string }) =>
				e.action === "POST /v1/admin/members/:id/erase",
		);
		expect(entry.details).toBeNull();
		expect(SAM).toBeTruthy();
	});
});

describe("an erasure", () => {
	it("leaves the address nowhere, nor what they wrote about their things", async () => {
		await setRole(DANA, "admin");
		// Noa wrote in, signed in and once signed out, and was invited by email.
		await as(NOA).post("/v1/contact", {
			topic: "data",
			body: "What do you keep?",
		});
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO contact_messages (id, member_id, community_id, email, topic, body, created_at)
				 VALUES ('01J0CONTACT0000000000000AN', NULL, ?, 'Noa@Example.com', 'data', 'Delete me', 1)`,
			).bind(FINCH),
			env.DB.prepare(
				`INSERT INTO invites (id, community_id, created_by, token_hash, max_uses, uses, expires_at, created_at, sent_to)
				 VALUES ('01J0INVITE00000000000000NO', ?, ?, 'h-noa', 1, 1, 9999999999, 1, 'noa@example.com')`,
			).bind(FINCH, DANA),
			env.DB.prepare(
				`INSERT INTO moderation_log (id, community_id, actor_id, action, target, details, created_at)
				 VALUES ('01J0LOG000000000000000NOA', ?, ?, 'POST /v1/admin/invites/email', NULL, '{"email":"noa@example.com"}', 1)`,
			).bind(FINCH, DANA),
			env.DB.prepare(
				"UPDATE copies SET note = 'By the gate', details = '{\"brand\":\"Noa''s own\"}' WHERE id = ?",
			).bind(COPY_A),
			env.DB.prepare("UPDATE copies SET owner_id = ? WHERE id = ?").bind(
				NOA,
				COPY_A,
			),
		]);
		try {
			expect(
				(
					await as(DANA).post(`/v1/admin/members/${NOA}/erase`, {
						confirm: "Noa",
					})
				).status,
			).toBe(200);
			const mentions = await env.DB.batch(
				[
					"SELECT count(*) AS n FROM contact_messages WHERE lower(email) = 'noa@example.com'",
					"SELECT count(*) AS n FROM invites WHERE sent_to = 'noa@example.com'",
					"SELECT count(*) AS n FROM moderation_log WHERE instr(details, 'noa@example.com') > 0",
					"SELECT count(*) AS n FROM copies WHERE details IS NOT NULL AND owner_id = '01J0MEMBER00000000000NXA00'",
				].map((sql) => env.DB.prepare(sql)),
			);
			expect(
				mentions.map((result) => (result.results[0] as { n: number }).n),
			).toEqual([0, 0, 0, 0]);
		} finally {
			await env.DB.prepare(
				"UPDATE copies SET owner_id = ?, state = 'shelved', note = NULL, details = NULL WHERE id = ?",
			)
				.bind(DANA, COPY_A)
				.run();
		}
	});
});
