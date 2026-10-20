import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, DANA, WORK } from "../test/api.ts";

/**
 * Two communities, one catalogue: a book or a tag can belong to both, and
 * neither community's moderator can change what belongs only to the other,
 * or rewrite for the other what they share.
 */
const BARNET = "01J0COMMUNITY000000BARNET";
const RUTH = "01J0MEMBER00000000000RUTH"; // Barnet's moderator

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare(
			`INSERT OR IGNORE INTO communities (id, slug, name, centre_lat, centre_lng, radius_m, join_policy, loan_days, created_at)
			 VALUES (?, 'barnet', 'Barnet', 51.65, -0.2, 3000, 'invite', 21, 1)`,
		).bind(BARNET),
		env.DB.prepare(
			`INSERT OR IGNORE INTO members (id, email, display_name, locale, created_at)
			 VALUES (?, 'ruth@example.com', 'Ruth', 'en', 1)`,
		).bind(RUTH),
		env.DB.prepare(
			`INSERT OR IGNORE INTO memberships (member_id, community_id, role, status, joined_at)
			 VALUES (?, ?, 'moderator', 'active', 1)`,
		).bind(RUTH, BARNET),
	]);
});

// Ruth is not one of the shared fixtures: what she listed goes before she does.
afterEach(async () => {
	await env.DB.batch([
		env.DB.prepare(
			"DELETE FROM copy_shares WHERE copy_id IN (SELECT id FROM copies WHERE owner_id = ?)",
		).bind(RUTH),
		env.DB.prepare("DELETE FROM copies WHERE owner_id = ?").bind(RUTH),
		env.DB.prepare("DELETE FROM work_communities WHERE community_id = ?").bind(
			BARNET,
		),
	]);
});

describe("books belong to communities", () => {
	it("keeps another community's moderator away from this library's book", async () => {
		expect(
			(await as(RUTH).patch(`/v1/admin/works/${WORK}`, { title: "Vandal" }))
				.status,
		).toBe(404);
		expect(
			(
				await as(RUTH).put(`/v1/works/${WORK}/tags`, {
					tags: ["genre:fiction"],
				})
			).status,
		).toBe(403);
		expect(
			(await as(DANA).patch(`/v1/admin/works/${WORK}`, { title: "Oz" })).status,
		).toBe(200);
	});

	it("puts a book in every community a copy of it is listed in", async () => {
		const listed = await as(RUTH).post("/v1/copies", {
			manual: { title: "Oz", authors: ["Baum"] },
		});
		expect(listed.status).toBe(201);
		expect(listed.body.workId).toBe(WORK);
		const { results } = await env.DB.prepare(
			"SELECT community_id FROM work_communities WHERE work_id = ? ORDER BY community_id",
		)
			.bind(WORK)
			.all<{ community_id: string }>();
		expect(results.map((row) => row.community_id)).toContain(BARNET);
		// Now Barnet's too: its moderator may look after it.
		expect(
			(await as(RUTH).patch(`/v1/admin/works/${WORK}`, { title: "Oz" })).status,
		).toBe(200);
	});
});

describe("tags belong to communities", () => {
	const make = (who: string) =>
		as(who).post("/v1/admin/tags", {
			namespace: "genre",
			value: "shared-shelf",
			labels: { en: "Shared shelf", he: "מדף משותף" },
		});
	const slugs = async (who: string) =>
		((await as(who).get("/v1/tags")).body.tags as { slug: string }[]).map(
			(tag) => tag.slug,
		);

	it("shows a community only its own tags", async () => {
		expect((await make(DANA)).status).toBe(201);
		expect(await slugs(DANA)).toContain("genre:shared-shelf");
		expect(await slugs(RUTH)).not.toContain("genre:shared-shelf");
	});

	it("lets a second community take up a tag, and neither rename it alone", async () => {
		await make(DANA);
		expect((await make(RUTH)).status).toBe(201);
		expect(await slugs(RUTH)).toContain("genre:shared-shelf");
		expect(
			(
				await as(DANA).patch("/v1/admin/tags/genre:shared-shelf", {
					labels: { en: "Mine now", he: "שלי" },
				})
			).status,
		).toBe(409);
	});

	it("removes a shared tag from one community and leaves it with the other", async () => {
		await make(DANA);
		await make(RUTH);
		expect(
			(await as(DANA).del("/v1/admin/tags/genre:shared-shelf")).status,
		).toBe(204);
		expect(await slugs(DANA)).not.toContain("genre:shared-shelf");
		expect(await slugs(RUTH)).toContain("genre:shared-shelf");
		// Now Barnet's alone, so Barnet may rename it.
		expect(
			(
				await as(RUTH).patch("/v1/admin/tags/genre:shared-shelf", {
					labels: { en: "Barnet's shelf", he: "המדף של בארנט" },
				})
			).status,
		).toBe(200);
	});

	it("cannot touch a tag it does not have", async () => {
		await make(DANA);
		expect(
			(await as(RUTH).del("/v1/admin/tags/genre:shared-shelf")).status,
		).toBe(404);
	});
});
