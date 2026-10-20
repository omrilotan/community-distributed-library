import { Hono } from "hono";
import {
	PublicShelvesRequest,
	TagMatch,
	parseTags,
	problem,
	type PublicShelves,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import type { Viewer } from "./auth.ts";
import { theLibrary } from "./library.ts";
import { listWorks } from "./listings.ts";
import { json } from "./problem.ts";
import { cachedVocabulary } from "./tags.ts";

export const publicRoutes = new Hono<{ Bindings: Env }>();

/**
 * Nobody: a viewer who owns nothing, has read nothing and lives nowhere, so
 * the listing leaves nothing out on their account and measures no distance.
 * The member-only filters (own copies, read, wished) never reach it.
 */
function nobody(communityId: string): Viewer {
	return {
		id: "",
		communityId,
		area: null,
		scopes: [],
		session: false,
		sessionId: null,
		client: null,
		role: "member",
		compact: true,
	};
}

/**
 * The shelves for somebody not signed in. The same books a member browsing
 * sees, by title, author and cover; who has them, how far away and whether
 * they are free today stay with the members.
 */
publicRoutes.get("/v1/public/shelves", async (c) => {
	const parsed = PublicShelvesRequest.safeParse({
		q: c.req.query("q") || undefined,
		offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
		limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
		sort: c.req.query("sort") || undefined,
	});
	if (!parsed.success) return json(c, problem(422, "Invalid request"));
	const { q, offset, limit, sort } = parsed.data;
	const library = await theLibrary(c.env);
	const page = await listWorks(c.env, nobody(library.id), {
		text: q,
		sort,
		limit,
		offset,
		includeOwn: true,
		includeRead: true,
		tags: parseTags(c.req.query("tags")),
		match: TagMatch.catch("facets").parse(c.req.query("match")),
	});
	return c.json({
		results: page.results.map(({ work, edition }) => ({
			work: { id: work.id, title: work.title, authors: work.authors },
			edition: { title: edition.title, coverUrl: edition.coverUrl },
		})),
		total: page.total,
		nextOffset: page.nextOffset,
	} satisfies PublicShelves);
});

/** The vocabulary the public shelves filter by: labels and how many books carry each. */
publicRoutes.get("/v1/public/tags", async (c) => {
	const library = await theLibrary(c.env);
	const { namespaces, tags } = await cachedVocabulary(
		c.env,
		c.executionCtx,
		library.id,
	);
	return c.json({ namespaces, tags });
});
