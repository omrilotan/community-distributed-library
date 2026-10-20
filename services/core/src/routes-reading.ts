import { Hono } from "hono";
import { problem, type WishlistResponse } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewerWith } from "./auth.ts";
import { denied, json } from "./problem.ts";
import { listWorks } from "./listings.ts";
import { now } from "./ids.ts";

/**
 * A member's own marks on books: what they have read, and what they want to.
 * Private to them; they change what browse and search show them, and the
 * wishlist tells them when a copy is free.
 */
export const reading = new Hono<{ Bindings: Env }>();

reading.put("/v1/me/read/:workId", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const workId = c.req.param("workId");
	const work = await c.env.DB.prepare("SELECT 1 FROM works WHERE id = ?")
		.bind(workId)
		.first();
	if (!work) return json(c, problem(404, "No such book"));
	await c.env.DB.batch([
		c.env.DB.prepare(
			"INSERT OR IGNORE INTO read_works (member_id, work_id, created_at) VALUES (?, ?, ?)",
		).bind(member.id, workId, now()),
		// Read it: no longer something to look out for.
		c.env.DB.prepare(
			"DELETE FROM wishlist WHERE member_id = ? AND work_id = ?",
		).bind(member.id, workId),
	]);
	return c.body(null, 204);
});

reading.delete("/v1/me/read/:workId", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	await c.env.DB.prepare(
		"DELETE FROM read_works WHERE member_id = ? AND work_id = ?",
	)
		.bind(member.id, c.req.param("workId"))
		.run();
	return c.body(null, 204);
});

reading.get("/v1/me/wishlist", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:read");
	if (!member) return denied(c, forbidden);
	const [listed, all] = await Promise.all([
		listWorks(c.env, member, {
			wished: true,
			includeOwn: true,
			includeRead: true,
			limit: 240,
		}),
		c.env.DB.prepare(
			`SELECT w.id, w.title, w.authors FROM wishlist l JOIN works w ON w.id = l.work_id
			  WHERE l.member_id = ? ORDER BY l.created_at DESC`,
		)
			.bind(member.id)
			.all<{ id: string; title: string; authors: string }>(),
	]);
	const here = new Set(listed.results.map((listing) => listing.work.id));
	const page: WishlistResponse = {
		results: listed.results,
		withoutCopies: all.results
			.filter((row) => !here.has(row.id))
			.map((row) => ({
				id: row.id,
				title: row.title,
				authors: JSON.parse(row.authors) as string[],
			})),
	};
	return c.json(page);
});

reading.put("/v1/me/wishlist/:workId", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const workId = c.req.param("workId");
	const work = await c.env.DB.prepare("SELECT 1 FROM works WHERE id = ?")
		.bind(workId)
		.first();
	if (!work) return json(c, problem(404, "No such book"));
	await c.env.DB.prepare(
		"INSERT OR IGNORE INTO wishlist (member_id, work_id, created_at) VALUES (?, ?, ?)",
	)
		.bind(member.id, workId, now())
		.run();
	return c.body(null, 204);
});

reading.delete("/v1/me/wishlist/:workId", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	await c.env.DB.prepare(
		"DELETE FROM wishlist WHERE member_id = ? AND work_id = ?",
	)
		.bind(member.id, c.req.param("workId"))
		.run();
	return c.body(null, 204);
});
