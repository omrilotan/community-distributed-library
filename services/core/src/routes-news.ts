import { Hono } from "hono";
import {
	NewsSeen,
	problem,
	type NewsItem,
	type NewsKind,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewerWith, type Viewer } from "./auth.ts";
import { denied, json } from "./problem.ts";
import { now } from "./ids.ts";

/**
 * What is new for a member, for the assistant they connected: the notices
 * the library already sent them (notify.ts keeps what each was about), from
 * where this connection last read. Nothing wakes an assistant, so it asks:
 * `whats_new` when a conversation starts, and a count at the end of every
 * other tool's answer (services/mcp).
 */
export const news = new Hono<{ Bindings: Env }>();

const PAGE = 50;
const WEEK = 7 * 24 * 60 * 60;

/**
 * Where a caller's news starts. A connection keeps two places: the last
 * notice it listed, and the last it counted in passing. Nothing from before
 * it was made counts, nor from before the member last opened the site: what
 * they saw there is not news. A browser session has no place to keep one,
 * and gets the last week.
 */
async function place(
	env: Env,
	member: Viewer,
): Promise<{ after: number; seen: number; hinted: number }> {
	if (!member.tokenId) return { after: now() - WEEK, seen: 0, hinted: 0 };
	const row = await env.DB.prepare(
		`SELECT t.created_at, t.news_seen, t.news_hinted, m.last_seen_at
		   FROM access_tokens t JOIN members m ON m.id = t.member_id
		  WHERE t.id = ?`,
	)
		.bind(member.tokenId)
		.first<{
			created_at: number;
			news_seen: number | null;
			news_hinted: number | null;
			last_seen_at: number | null;
		}>();
	return {
		after: Math.max(row?.created_at ?? now(), row?.last_seen_at ?? 0),
		seen: row?.news_seen ?? 0,
		hinted: row?.news_hinted ?? 0,
	};
}

interface Row {
	seq: number;
	kind: NewsKind;
	detail: string | null;
	title: string | null;
	url: string | null;
	created_at: number;
}

const idIn = (url: string | null, under: string) =>
	url?.match(new RegExp(`/${under}/([0-9A-Z]{26})(?:[/?#]|$)`))?.[1] ?? null;

news.get("/v1/me/news", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	const from = await place(c.env, member);
	const { results } = await c.env.DB.prepare(
		`SELECT seq, kind, detail, title, url, created_at FROM notices
		  WHERE member_id = ? AND seq > ? AND created_at >= ?
		  ORDER BY seq LIMIT ?`,
	)
		.bind(member.id, from.seen, from.after, PAGE + 1)
		.all<Row>();
	const page = results.slice(0, PAGE);
	return c.json({
		news: page.map((row): NewsItem => ({
			kind: row.kind,
			detail: row.detail,
			title: row.title,
			url: row.url,
			loanId: idIn(row.url, "loans"),
			workId: idIn(row.url, "works"),
			at: row.created_at,
		})),
		until: page.at(-1)?.seq ?? from.seen,
		more: results.length > PAGE,
	});
});

/** The member has been told: this connection reads on from here. */
news.post("/v1/me/news/seen", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	const parsed = NewsSeen.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid request"));
	if (member.tokenId)
		await c.env.DB.prepare(
			// Never backwards, and never past what there is: a place ahead of
			// the last notice would swallow the next ones.
			`UPDATE access_tokens
			    SET news_seen = max(coalesce(news_seen, 0),
			                        min(?1, (SELECT coalesce(max(seq), 0) FROM notices)))
			  WHERE id = ?2`,
		)
			.bind(parsed.data.until, member.tokenId)
			.run();
	return c.body(null, 204);
});

/**
 * How many notices are new, by kind, each counted once per connection: for
 * the assistant to mention at the end of whatever else it was asked. They
 * stay in the list above until it is read. Counts only: what the notices
 * say is written by other members, and belongs behind a tool the assistant
 * calls on purpose.
 */
news.post("/v1/me/news/hint", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	if (!member.tokenId) return c.json({ counts: {} });
	const from = await place(c.env, member);
	const { results } = await c.env.DB.prepare(
		`SELECT kind, count(*) AS n, max(seq) AS top FROM notices
		  WHERE member_id = ? AND seq > ? AND created_at >= ?
		  GROUP BY kind`,
	)
		.bind(member.id, Math.max(from.seen, from.hinted), from.after)
		.all<{ kind: string; n: number; top: number }>();
	if (results.length)
		await c.env.DB.prepare(
			"UPDATE access_tokens SET news_hinted = max(coalesce(news_hinted, 0), ?) WHERE id = ?",
		)
			.bind(Math.max(...results.map((row) => row.top)), member.tokenId)
			.run();
	return c.json({
		counts: Object.fromEntries(results.map((row) => [row.kind, row.n])),
	});
});
