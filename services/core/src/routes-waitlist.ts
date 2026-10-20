import { Hono } from "hono";
import { JoinWaitlist, problem, type WaitlistEntry } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewerWith } from "./auth.ts";
import { denied, json } from "./problem.ts";
import { joinWaitlist, onCopyAvailable } from "./waitlist.ts";
import { now } from "./ids.ts";

/** Follow a work; be first to hear when a copy frees up. */
export const waitlist = new Hono<{ Bindings: Env }>();

waitlist.post("/v1/waitlist", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const parsed = JoinWaitlist.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid request"));
	const work = await c.env.DB.prepare("SELECT 1 FROM works WHERE id = ?")
		.bind(parsed.data.workId)
		.first();
	if (!work) return json(c, problem(404, "No such book"));
	// Your own copy is not something to queue for: it comes back to you.
	const own = await c.env.DB.prepare(
		`SELECT 1 FROM copies c JOIN editions e ON e.id = c.edition_id
		  WHERE e.work_id = ? AND c.owner_id = ? AND c.state != 'retired'`,
	)
		.bind(parsed.data.workId, member.id)
		.first();
	if (own) {
		return json(
			c,
			problem(409, "Already yours", "You have a copy of this book"),
		);
	}
	const entry = await joinWaitlist(
		c.env,
		member.id,
		member.communityId,
		parsed.data.workId,
	);
	return c.json(entry, 201);
});

waitlist.delete("/v1/waitlist/:id", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const left = await c.env.DB.prepare(
		`DELETE FROM waitlist WHERE id = ? AND member_id = ?
		  RETURNING offered_copy_id, offer_expires_at`,
	)
		.bind(c.req.param("id"), member.id)
		.first<{
			offered_copy_id: string | null;
			offer_expires_at: number | null;
		}>();
	if (!left) return json(c, problem(404, "Not on the list"));
	// Leaving with a copy held: it goes to the next in line.
	if (left.offered_copy_id && (left.offer_expires_at ?? 0) > now())
		c.executionCtx.waitUntil(
			onCopyAvailable(c.env, left.offered_copy_id).catch(() => undefined),
		);
	return c.body(null, 204);
});

waitlist.get("/v1/me/waitlist", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	const { results } = await c.env.DB.prepare(
		`SELECT w.id, w.work_id, w.created_at, w.offered_copy_id, w.offer_expires_at,
		        wk.title, wk.authors,
		        (SELECT cover_url FROM editions e WHERE e.work_id = w.work_id AND cover_url IS NOT NULL LIMIT 1) AS cover_url,
		        (SELECT count(*) FROM waitlist o WHERE o.work_id = w.work_id AND o.community_id = w.community_id
		           AND o.created_at <= w.created_at) AS position
		   FROM waitlist w JOIN works wk ON wk.id = w.work_id
		  WHERE w.member_id = ? AND w.community_id = ?
		  ORDER BY w.created_at DESC`,
	)
		.bind(member.id, member.communityId)
		.all<{
			id: string;
			work_id: string;
			created_at: number;
			offered_copy_id: string | null;
			offer_expires_at: number | null;
			title: string;
			authors: string;
			cover_url: string | null;
			position: number;
		}>();
	const at = now();
	const entries: WaitlistEntry[] = results.map((row) => ({
		id: row.id,
		workId: row.work_id,
		title: row.title,
		authors: JSON.parse(row.authors) as string[],
		coverUrl: row.cover_url,
		position: row.position,
		createdAt: row.created_at,
		offer:
			row.offered_copy_id && row.offer_expires_at && row.offer_expires_at > at
				? { copyId: row.offered_copy_id, expiresAt: row.offer_expires_at }
				: null,
	}));
	return c.json({ entries });
});
