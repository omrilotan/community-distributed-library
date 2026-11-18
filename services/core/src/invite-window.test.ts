import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, as, DANA, SAM } from "../test/api.ts";
import { windowOf } from "./invites.ts";

const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const COMMUNITY = "01J0COMMUNITY0000000FINCH";

const stateOf = async (token: string) =>
	(await api(null, "POST", "/v1/invites/state", { token })).body;

const askToJoin = (email: string, invite: string) =>
	api(null, "POST", "/v1/auth/magic-link", { email, invite });

describe("an event's window", () => {
	const at = 1_800_000_000;

	it("takes both ends or neither", () => {
		expect(windowOf({}, at)).toBeNull();
		expect(windowOf({ startsAt: at }, at)).toBe("invalid");
		expect(windowOf({ expiresAt: at + DAY }, at)).toBe("invalid");
		expect(windowOf({ startsAt: at, expiresAt: at + DAY }, at)).toEqual({
			startsAt: at,
			expiresAt: at + DAY,
		});
	});

	it("allows today, which began before now", () => {
		expect(
			windowOf({ startsAt: at - 10 * 3600, expiresAt: at + 14 * 3600 }, at),
		).toEqual({ startsAt: at - 10 * 3600, expiresAt: at + 14 * 3600 });
	});

	it("refuses one that closes before it opens, is over, or is too far off", () => {
		expect(windowOf({ startsAt: at + DAY, expiresAt: at }, at)).toBe("invalid");
		expect(windowOf({ startsAt: at - 3 * DAY, expiresAt: at - DAY }, at)).toBe(
			"invalid",
		);
		expect(
			windowOf({ startsAt: at + 40 * DAY, expiresAt: at + 41 * DAY }, at),
		).toBe("invalid");
		expect(windowOf({ startsAt: at, expiresAt: at + 31 * DAY }, at)).toBe(
			"invalid",
		);
	});
});

describe("a moderator's link for an event day", () => {
	it("opens on the day, not before", async () => {
		const startsAt = nowSeconds() + 2 * DAY;
		const expiresAt = startsAt + DAY;
		const made = await as(DANA).post("/v1/admin/invites", {
			maxUses: 50,
			startsAt,
			expiresAt,
		});
		expect(made.status).toBe(201);
		expect(made.body).toMatchObject({ maxUses: 50, startsAt, expiresAt });

		// Scanned ahead of the day: the page can say when it opens.
		expect(await stateOf(made.body.token)).toEqual({
			state: "early",
			maxUses: 50,
			startsAt,
			expiresAt,
			membersInvite: true,
		});
		// And it lets nobody in yet: no sign-in link for a stranger.
		const early = await askToJoin("early.bird@example.com", made.body.token);
		expect(early.body.debugUrl).toBeUndefined();

		// The list shows when it opens.
		const listed = await as(DANA).get("/v1/admin/invites");
		expect(
			listed.body.invites.find(
				(one: { id: string }) => one.id === made.body.id,
			),
		).toMatchObject({ startsAt, expiresAt, maxUses: 50 });

		// The day comes.
		await env.DB.prepare("UPDATE invites SET starts_at = ? WHERE id = ?")
			.bind(nowSeconds() - 60, made.body.id)
			.run();
		expect(await stateOf(made.body.token)).toEqual({ state: "usable" });
		const onTheDay = await askToJoin("on.time@example.com", made.body.token);
		const token = new URL(onTheDay.body.debugUrl).searchParams.get("token");
		expect(
			(await api(null, "POST", "/v1/auth/exchange", { token })).status,
		).toBe(200);
	});

	it("says it was for its day once the day is over", async () => {
		const made = await as(DANA).post("/v1/admin/invites", {
			maxUses: 20,
			startsAt: nowSeconds() - 3600,
			expiresAt: nowSeconds() + 3600,
		});
		await env.DB.prepare(
			"UPDATE invites SET starts_at = ?, expires_at = ? WHERE id = ?",
		)
			.bind(nowSeconds() - 2 * DAY, nowSeconds() - DAY, made.body.id)
			.run();
		expect(await stateOf(made.body.token)).toMatchObject({
			state: "expired",
			maxUses: 20,
			startsAt: nowSeconds() - 2 * DAY,
		});
	});

	it("refuses a window that makes no sense", async () => {
		const at = nowSeconds();
		for (const body of [
			{ startsAt: at + DAY },
			{ startsAt: at + DAY, expiresAt: at },
			{ startsAt: at + 60 * DAY, expiresAt: at + 61 * DAY },
		])
			expect((await as(DANA).post("/v1/admin/invites", body)).status).toBe(422);
		expect(
			(await as(DANA).post("/v1/invites", { startsAt: at + DAY })).status,
		).toBe(422);
	});

	it("is a moderator's: a member's link starts now", async () => {
		const made = await as(SAM).post("/v1/invites", {
			startsAt: nowSeconds() + DAY,
			expiresAt: nowSeconds() + 2 * DAY,
		});
		expect(made.status).toBe(201);
		expect(made.body.startsAt).toBeNull();
		expect(await stateOf(made.body.token)).toEqual({ state: "usable" });
		await env.DB.prepare("UPDATE invites SET revoked_at = 1 WHERE id = ?")
			.bind(made.body.id)
			.run();
	});
});

describe("what a spent link says", () => {
	it("tells one person's link from a group's, and who can invite", async () => {
		const single = await as(DANA).post("/v1/admin/invites", { maxUses: 1 });
		await env.DB.prepare("UPDATE invites SET uses = 1 WHERE id = ?")
			.bind(single.body.id)
			.run();
		expect(await stateOf(single.body.token)).toMatchObject({
			state: "used",
			maxUses: 1,
			startsAt: null,
			membersInvite: true,
		});

		const group = await as(DANA).post("/v1/admin/invites", { maxUses: 30 });
		await env.DB.prepare("UPDATE invites SET uses = 30 WHERE id = ?")
			.bind(group.body.id)
			.run();
		await env.DB.prepare(
			"UPDATE communities SET member_invites_open = 0 WHERE id = ?",
		)
			.bind(COMMUNITY)
			.run();
		try {
			expect(await stateOf(group.body.token)).toMatchObject({
				state: "used",
				maxUses: 30,
				membersInvite: false,
			});
		} finally {
			await env.DB.prepare(
				"UPDATE communities SET member_invites_open = 5 WHERE id = ?",
			)
				.bind(COMMUNITY)
				.run();
		}
	});

	it("says nothing about a withdrawn or made-up link", async () => {
		const made = await as(DANA).post("/v1/admin/invites", { maxUses: 3 });
		await as(DANA).post(`/v1/admin/invites/${made.body.id}/revoke`);
		expect(await stateOf(made.body.token)).toEqual({ state: "usable" });
		expect(await stateOf("not-a-real-token-at-all")).toEqual({
			state: "usable",
		});
	});
});
