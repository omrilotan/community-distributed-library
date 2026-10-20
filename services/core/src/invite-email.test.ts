import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, as, DANA, SAM } from "../test/api.ts";

const invitations = async (to: string) =>
	(
		await (
			env.NOTIFY as unknown as {
				sentMessages(): Promise<
					{ kind: string; to: string; url: string; expiresInDays: number }[]
				>;
			}
		).sentMessages()
	).filter((message) => message.kind === "invitation" && message.to === to);

describe("a moderator inviting by email", () => {
	it("sends one link that joins and signs in", async () => {
		const sent = await as(DANA).post("/v1/admin/invites/email", {
			email: "New.Neighbour@Example.com",
		});
		expect(sent.status).toBe(201);

		const [message] = await invitations("new.neighbour@example.com");
		expect(message?.expiresInDays).toBeGreaterThan(0);
		const token = new URL(message!.url).searchParams.get("token")!;

		const joined = await api(null, "POST", "/v1/auth/exchange", { token });
		expect(joined.status).toBe(200);
		expect(joined.body.isNew).toBe(true);

		const listed = await as(DANA).get("/v1/admin/invites");
		expect(
			listed.body.invites.find(
				(one: { id: string }) => one.id === sent.body.id,
			),
		).toMatchObject({ sentTo: "new.neighbour@example.com", uses: 1 });
	});

	it("says so when the address is already a member", async () => {
		const sent = await as(DANA).post("/v1/admin/invites/email", {
			email: "sam@example.com",
		});
		expect(sent.status).toBe(409);
	});

	it("shows the address only to whoever sent it, and the admin", async () => {
		await as(DANA).post("/v1/admin/invites/email", {
			email: "someone.new@example.com",
		});
		const promote = (role: string) =>
			env.DB.prepare(
				"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = '01J0COMMUNITY0000000FINCH'",
			)
				.bind(role, SAM)
				.run();
		const addresses = async (who: string) =>
			(await as(who).get("/v1/admin/invites")).body.invites.map(
				(invite: { sentTo: string | null }) => invite.sentTo,
			);
		expect(await addresses(DANA)).toContain("someone.new@example.com");
		await promote("moderator");
		try {
			expect(await addresses(SAM)).not.toContain("someone.new@example.com");
			await promote("admin");
			expect(await addresses(SAM)).toContain("someone.new@example.com");
		} finally {
			await promote("member");
		}
	});

	it("is for moderators only", async () => {
		const sent = await as(SAM).post("/v1/admin/invites/email", {
			email: "someone@example.com",
		});
		expect(sent.status).toBe(403);
	});
});

describe("what became of an invite", () => {
	const state = async (token: string) =>
		(await api(null, "POST", "/v1/invites/state", { token })).body.state;
	const made = async () => {
		const { body } = await as(SAM).post("/v1/invites", {});
		return {
			id: body.id as string,
			token: new URL(body.url).searchParams.get("invite")!,
		};
	};
	const set = (id: string, sql: string) =>
		env.DB.prepare(`UPDATE invites SET ${sql} WHERE id = ?`).bind(id).run();

	it("tells a used-up link from an expired one, and nothing more", async () => {
		const used = await made();
		expect(await state(used.token)).toBe("usable");
		await set(used.id, "uses = max_uses");
		expect(await state(used.token)).toBe("used");

		const old = await made();
		await set(old.id, "expires_at = unixepoch() - 60");
		expect(await state(old.token)).toBe("expired");

		const withdrawn = await made();
		await set(withdrawn.id, "revoked_at = unixepoch()");
		expect(await state(withdrawn.token)).toBe("usable");
		expect(await state("made-up")).toBe("usable");
	});
});

describe("a member's page, for moderators", () => {
	it("says whether they are set up to meet, without saying where", async () => {
		await env.DB.prepare("UPDATE members SET meeting_place = ? WHERE id = ?")
			.bind("12 Example Road", SAM)
			.run();
		await env.DB.prepare("DELETE FROM availability WHERE member_id = ?")
			.bind(SAM)
			.run();
		const page = (await as(DANA).get(`/v1/admin/members/${SAM}`)).body;
		expect(page.member).toMatchObject({
			hasMeetingPlace: true,
			hasAvailability: false,
		});
		expect(JSON.stringify(page)).not.toContain("12 Example Road");
	});
});
