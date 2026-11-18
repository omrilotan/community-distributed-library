import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, as, DANA, SAM } from "../test/api.ts";
import { seal, unseal } from "./seal.ts";

const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const linkOf = (who: string, id: string) =>
	as(who).post(`/v1/me/invites/${id}/link`);
const mine = async (who: string, id: string) =>
	(await as(who).get("/v1/me/invites")).body.invites.find(
		(one: { id: string }) => one.id === id,
	);

describe("a sealed copy", () => {
	it("opens with its key and its row, and nothing else", async () => {
		const sealed = await seal(env, "a-link-token", "row-1");
		expect(sealed).not.toContain("a-link-token");
		expect(await unseal(env, sealed, "row-1")).toBe("a-link-token");
		expect(await unseal(env, sealed, "row-2")).toBeNull();
		expect(
			await unseal({ ...env, INVITE_KEY: "another key" }, sealed, "row-1"),
		).toBeNull();
		expect(await unseal(env, "not.sealed", "row-1")).toBeNull();
		expect(await unseal(env, null, "row-1")).toBeNull();
	});

	it("is not made where the library has no key", async () => {
		const { INVITE_KEY: _, ...without } = env;
		expect(
			await seal(without as typeof env, "a-link-token", "row-1"),
		).toBeNull();
	});
});

describe("an invite's link, shown again", () => {
	it("gives its maker the same link while it is open", async () => {
		const made = await as(SAM).post("/v1/invites", {});
		expect(made.status).toBe(201);
		expect(await mine(SAM, made.body.id)).toMatchObject({ showable: true });

		const again = await linkOf(SAM, made.body.id);
		expect(again.status).toBe(200);
		expect(again.body).toMatchObject({
			id: made.body.id,
			url: made.body.url,
			token: made.body.token,
			maxUses: 1,
			startsAt: null,
			expiresAt: made.body.expiresAt,
		});

		// The database holds no token to read: a hash, and a sealed copy.
		const row = await env.DB.prepare(
			"SELECT token_hash, token_sealed FROM invites WHERE id = ?",
		)
			.bind(made.body.id)
			.first<{ token_hash: string; token_sealed: string }>();
		expect(JSON.stringify(row)).not.toContain(made.body.token);
	});

	it("is its maker's alone", async () => {
		const made = await as(SAM).post("/v1/invites", {});
		expect((await linkOf(DANA, made.body.id)).status).toBe(404);
		expect(
			(await api(null, "POST", `/v1/me/invites/${made.body.id}/link`)).status,
		).toBe(401);
	});

	it("shows a moderator their event's link before its day, in their list", async () => {
		const startsAt = nowSeconds() + 2 * DAY;
		const made = await as(DANA).post("/v1/admin/invites", {
			maxUses: 30,
			startsAt,
			expiresAt: startsAt + DAY,
		});
		const listed = (await as(DANA).get("/v1/admin/invites")).body.invites;
		expect(
			listed.find((one: { id: string }) => one.id === made.body.id),
		).toMatchObject({ showable: true });
		const again = await linkOf(DANA, made.body.id);
		expect(again.body).toMatchObject({
			url: made.body.url,
			maxUses: 30,
			startsAt,
			expiresAt: startsAt + DAY,
		});

		// Another moderator's link is not mine to show.
		const sams = await as(SAM).post("/v1/invites", {});
		const all = (await as(DANA).get("/v1/admin/invites")).body.invites;
		expect(
			all.find((one: { id: string }) => one.id === sams.body.id),
		).toMatchObject({ showable: false });
	});

	it("stops once the invite is withdrawn, used up or over", async () => {
		const withdrawn = await as(SAM).post("/v1/invites", {});
		await as(SAM).post(`/v1/me/invites/${withdrawn.body.id}/revoke`);
		expect((await linkOf(SAM, withdrawn.body.id)).status).toBe(404);

		const used = await as(SAM).post("/v1/invites", {});
		await env.DB.prepare("UPDATE invites SET uses = max_uses WHERE id = ?")
			.bind(used.body.id)
			.run();
		expect((await linkOf(SAM, used.body.id)).status).toBe(404);
		expect(await mine(SAM, used.body.id)).toMatchObject({ showable: false });

		const over = await as(SAM).post("/v1/invites", {});
		await env.DB.prepare("UPDATE invites SET expires_at = ? WHERE id = ?")
			.bind(nowSeconds() - 60, over.body.id)
			.run();
		expect((await linkOf(SAM, over.body.id)).status).toBe(404);
	});

	it("has nothing to show for a link made before links were kept", async () => {
		const made = await as(SAM).post("/v1/invites", {});
		await env.DB.prepare("UPDATE invites SET token_sealed = NULL WHERE id = ?")
			.bind(made.body.id)
			.run();
		expect(await mine(SAM, made.body.id)).toMatchObject({ showable: false });
		expect((await linkOf(SAM, made.body.id)).status).toBe(404);
	});

	it("refuses a sealed copy moved from another invite", async () => {
		const one = await as(SAM).post("/v1/invites", {});
		const other = await as(SAM).post("/v1/invites", {});
		await env.DB.prepare(
			"UPDATE invites SET token_sealed = (SELECT token_sealed FROM invites WHERE id = ?) WHERE id = ?",
		)
			.bind(other.body.id, one.body.id)
			.run();
		expect((await linkOf(SAM, one.body.id)).status).toBe(404);
	});
});
