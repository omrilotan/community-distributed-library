import { Hono } from "hono";
import {
	WantedRequest,
	problem,
	type WantedWork,
	type WorkCard,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewerWith } from "./auth.ts";
import { resolveEdition, resolveWork } from "./catalogue.ts";
import { denied, json } from "./problem.ts";
import { theLibrary } from "./library.ts";
import { joinWaitlist } from "./waitlist.ts";

export const wanted = new Hono<{ Bindings: Env }>();

/**
 * Ask for a book nobody has listed. The work is created (or found) exactly as
 * a listing would create it, and the member joins its waitlist — so the first
 * copy listed is held for them (waitlist.ts).
 */
wanted.post("/v1/wanted", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const parsed = WantedRequest.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid request"));
	const { isbn13, title, authors } = parsed.data;

	let workId: string | null = null;
	if (isbn13) {
		const lookup = await c.env.METADATA.lookup(isbn13);
		if (lookup)
			workId = (await resolveEdition(c.env, { kind: "isbn", lookup })).workId;
	}
	// By name: the book is waited for, so a work is enough. An edition is
	// made by whoever lists a copy, not by every ask.
	if (!workId && title) workId = await resolveWork(c.env, title, authors);
	if (!workId)
		return json(c, problem(404, "Unknown ISBN", "Add the title instead"));

	const entry = await joinWaitlist(
		c.env,
		member.id,
		member.communityId,
		workId,
	);
	return c.json({ workId, position: entry?.position ?? 1 }, 201);
});

/** Books with a queue and no lendable copy on any shelf: a nudge to list them. */
wanted.get("/v1/wanted", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	const { results } = await c.env.DB.prepare(
		`SELECT w.id, w.title, w.authors,
		        (SELECT e.cover_url FROM editions e WHERE e.work_id = w.id AND e.cover_url IS NOT NULL LIMIT 1) AS cover_url,
		        (SELECT e.isbn13 FROM editions e WHERE e.work_id = w.id AND e.isbn13 IS NOT NULL LIMIT 1) AS isbn13,
		        count(DISTINCT wl.member_id) AS waiting
		   FROM waitlist wl JOIN works w ON w.id = wl.work_id
		  WHERE wl.community_id = ?
		    AND NOT EXISTS (
		      SELECT 1 FROM copies c JOIN editions e ON e.id = c.edition_id
		        JOIN copy_shares cs ON cs.copy_id = c.id
		       WHERE e.work_id = w.id AND cs.community_id = wl.community_id
		         AND c.state = 'shelved' AND c.lending = 'lendable')
		  GROUP BY w.id ORDER BY waiting DESC, min(wl.created_at) LIMIT 12`,
	)
		.bind(member.communityId)
		.all<{
			id: string;
			title: string;
			authors: string;
			cover_url: string | null;
			isbn13: string | null;
			waiting: number;
		}>();
	const works: WantedWork[] = results.map((row) => ({
		workId: row.id,
		title: row.title,
		authors: JSON.parse(row.authors) as string[],
		coverUrl: row.cover_url,
		isbn13: row.isbn13,
		waiting: row.waiting,
	}));
	return c.json({ works });
});

/**
 * What a visitor may know about the library before signing in: its name and
 * words, what it lends, the languages it offers and the one it opens in.
 */
wanted.get("/v1/community", async (c) => {
	const library = await theLibrary(c.env);
	c.header("cache-control", "public, max-age=60");
	return c.json({
		name: library.name,
		type: library.type,
		languages: library.languages,
		defaultLocale: library.defaultLocale,
		texts: library.texts,
		// Everyone lives close by: no areas or distances anywhere.
		compact: library.compact,
		// The library's own colour, or null for the house green.
		accent: library.accent,
	});
});

/** Public card for link previews and the signed-out teaser. Book data only. */
wanted.get("/v1/works/:id/card", async (c) => {
	const row = await c.env.DB.prepare(
		`SELECT w.id, w.title, w.authors,
		        (SELECT e.cover_url FROM editions e WHERE e.work_id = w.id AND e.cover_url IS NOT NULL LIMIT 1) AS cover_url,
		        (SELECT e.isbn13 FROM editions e WHERE e.work_id = w.id AND e.isbn13 IS NOT NULL LIMIT 1) AS isbn13,
		        (SELECT count(*) FROM copies c JOIN editions e ON e.id = c.edition_id
		          WHERE e.work_id = w.id AND c.state != 'retired') AS copies,
		        (SELECT count(*) FROM waitlist wl WHERE wl.work_id = w.id) AS waiting
		   FROM works w WHERE w.id = ?`,
	)
		.bind(c.req.param("id"))
		.first<{
			id: string;
			title: string;
			authors: string;
			cover_url: string | null;
			isbn13: string | null;
			copies: number;
			waiting: number;
		}>();
	if (!row) return json(c, problem(404, "No such book"));
	const card: WorkCard = {
		id: row.id,
		title: row.title,
		authors: JSON.parse(row.authors) as string[],
		coverUrl: row.cover_url,
		isbn13: row.isbn13,
		copies: row.copies,
		waiting: row.waiting,
	};
	c.header("cache-control", "public, max-age=300");
	return c.json(card);
});
