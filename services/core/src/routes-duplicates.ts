import { Hono } from "hono";
import { EditWork, problem } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { moderator, viewer, viewerWith } from "./auth.ts";
import { ownCover } from "./covers.ts";
import { denied, json } from "./problem.ts";
import { searchKey } from "./normalise.ts";
import {
	markDistinct,
	mergeWorks,
	similarWorks,
	similarity,
	type Candidate,
	duplicatePairs,
} from "./duplicates.ts";
import { workInCommunity } from "./community-catalogue.ts";
import { record } from "./audit.ts";
import { photosFollowCover } from "./things.ts";

export const duplicates = new Hono<{ Bindings: Env }>();

/** Books that might be the same as this one. Shown right after listing. */
duplicates.get("/v1/works/:id/duplicates", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	const work = await load(c.env, c.req.param("id"));
	if (!work) return json(c, problem(404, "No such book"));
	return c.json({
		candidates: await similarWorks(c.env, member.communityId, work),
	});
});

/**
 * Fold this book into another. A member may fold in a book they own a copy
 * of: the one that disappears is theirs, and they are holding it, which is
 * the only way to be sure. Folding somebody else's book into yours would
 * remove their book and its queue, so that is a moderator's call.
 */
duplicates.post("/v1/works/:id/merge", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const sourceId = c.req.param("id");
	const body = (await c.req.json().catch(() => null)) as {
		into?: string;
		keepTitle?: boolean;
	} | null;
	if (!body?.into) return json(c, problem(422, "Merge into which book?"));

	const [source, target] = await Promise.all([
		load(c.env, sourceId),
		load(c.env, body.into),
	]);
	if (!source || !target) return json(c, problem(404, "No such book"));

	// A moderator looks after this community's books, not another's.
	const moderatorHere =
		member.scopes.includes("admin") &&
		(await isModerator(c.env, member.id, member.communityId)) &&
		(await workInCommunity(c.env, sourceId, member.communityId)) &&
		(await workInCommunity(c.env, body.into, member.communityId));
	// A member folds away only a book that is theirs alone: anyone else's
	// copy would move under a title they never chose.
	const mayMerge =
		moderatorHere || (await ownsEveryCopy(c.env, member.id, sourceId));
	if (!mayMerge) {
		return json(
			c,
			problem(
				403,
				"Not only your book",
				"Merging is for whoever owns every copy, or a moderator",
			),
		);
	}
	// Keeping this title renames the other book: the same rule applies to it.
	if (
		body.keepTitle &&
		!moderatorHere &&
		!(await ownsEveryCopy(c.env, member.id, body.into))
	) {
		return json(
			c,
			problem(403, "Not only your book", "Others list the book it joins"),
		);
	}
	// A guard, not a gate: a moderator who means it can still pick the pair.
	if (similarity(source, target) === 0 && !moderatorHere) {
		return json(
			c,
			problem(409, "These look like different books", "Ask a moderator"),
		);
	}

	// Folding in a book that is not one's own is a moderator's power: logged.
	if (moderatorHere && !(await ownsACopy(c.env, member.id, sourceId)))
		await record(c.env, {
			communityId: member.communityId,
			actorId: member.id,
			via: member.client,
			action: "POST /v1/works/:id/merge",
			target: sourceId,
			details: JSON.stringify({ into: body.into }),
		});
	await mergeWorks(
		c.env,
		sourceId,
		body.into,
		body.keepTitle
			? { title: source.title, authors: source.authors }
			: undefined,
	);
	return c.json({ work: body.into }, 200);
});

/** "No, mine is a different book." Remembered, so nobody is asked twice. */
duplicates.post("/v1/works/:id/distinct", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const body = (await c.req.json().catch(() => null)) as {
		from?: string;
	} | null;
	if (!body?.from) return json(c, problem(422, "Distinct from which book?"));
	const [one, other] = [c.req.param("id"), body.from];
	if (!(await load(c.env, one)) || !(await load(c.env, other)))
		return json(c, problem(404, "No such book"));
	// Said by someone with a copy of one of the two, or a moderator: a
	// stranger to both books has nothing to tell the duplicates queue.
	const moderatorHere =
		member.scopes.includes("admin") &&
		(await isModerator(c.env, member.id, member.communityId));
	const owner =
		(await ownsACopy(c.env, member.id, one)) ||
		(await ownsACopy(c.env, member.id, other));
	if (!owner && !moderatorHere)
		return json(
			c,
			problem(403, "Not your book", "Tell us about a book you list"),
		);
	await markDistinct(c.env, one, other, member.id);
	if (!owner)
		await record(c.env, {
			communityId: member.communityId,
			actorId: member.id,
			via: member.client,
			action: "POST /v1/works/:id/distinct",
			target: one,
			details: JSON.stringify({ from: other }),
		});
	return c.body(null, 204);
});

/**
 * Correct a book's title or authors. Members can only edit a copy they own,
 * and only while nobody else shares the edition; a moderator can fix the book
 * itself, which is what a mistyped title needs.
 */
duplicates.patch("/v1/admin/works/:id", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const parsed = EditWork.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid details"));

	const workId = c.req.param("id");
	const work = await load(c.env, workId);
	// Another community's book is not this moderator's to correct.
	if (!work || !(await workInCommunity(c.env, workId, who.communityId)))
		return json(c, problem(404, "No such book"));

	const edit = parsed.data;
	const title = edit.title ?? work.title;
	const authors = edit.authors ?? work.authors;
	const key = searchKey(`${title} ${authors.join(" ")}`);
	const note = edit.note === undefined ? work.note : edit.note || null;
	const statements = [
		c.env.DB.prepare(
			"UPDATE works SET title = ?, authors = ?, search_key = ?, note = ? WHERE id = ?",
		).bind(title, JSON.stringify(authors), key, note, workId),
	];

	const editions = await c.env.DB.prepare(
		"SELECT id FROM editions WHERE work_id = ?",
	)
		.bind(workId)
		.all<{ id: string }>();
	const only =
		editions.results.length === 1 ? editions.results[0]!.id : undefined;

	// The cover belongs to an edition, so it needs one edition to belong to.
	if (edit.coverUrl !== undefined && !only) {
		return json(
			c,
			problem(
				409,
				"Several editions",
				"This book has more than one edition. Merge them first.",
			),
		);
	}

	if (only) {
		const sets: string[] = [];
		const binds: unknown[] = [];
		// With one edition the two titles are the same thing to a reader, so the
		// correction has to reach the edition too or the tiles keep the old one.
		if (edit.title) {
			sets.push("title = ?", "search_key = ?");
			binds.push(title, key);
		}
		if (edit.coverUrl !== undefined) {
			// Null clears it; anything else is fetched into our own bucket.
			const cover = edit.coverUrl ? await ownCover(c.env, edit.coverUrl) : null;
			if (edit.coverUrl && !cover) {
				return json(
					c,
					problem(422, "Invalid cover", "Could not take that image"),
				);
			}
			sets.push("cover_url = ?");
			binds.push(cover);
			statements.push(photosFollowCover(c.env, only, cover));
		}
		if (sets.length) {
			statements.push(
				c.env.DB.prepare(
					`UPDATE editions SET ${sets.join(", ")} WHERE id = ?`,
				).bind(...binds, only),
			);
		}
	}

	await c.env.DB.batch(statements);
	return c.json({ title, authors, note });
});

/** Every suspected pair in the community, for a moderator to settle. */
duplicates.get("/v1/admin/duplicates", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));

	return c.json({ pairs: await duplicatePairs(c.env, who.communityId) });
});

async function load(env: Env, id: string) {
	const row = await env.DB.prepare(
		"SELECT id, title, authors, note FROM works WHERE id = ?",
	)
		.bind(id)
		.first<{
			id: string;
			title: string;
			authors: string;
			note: string | null;
		}>();
	return row
		? {
				id: row.id,
				title: row.title,
				authors: JSON.parse(row.authors) as string[],
				note: row.note,
			}
		: null;
}

function ownsACopy(env: Env, memberId: string, workId: string) {
	return env.DB.prepare(
		`SELECT 1 FROM copies c JOIN editions e ON e.id = c.edition_id
		  WHERE e.work_id = ? AND c.owner_id = ? AND c.state != 'retired'`,
	)
		.bind(workId, memberId)
		.first()
		.then(Boolean);
}

/** The member lists a copy of the work, and nobody else lists one. */
async function ownsEveryCopy(env: Env, memberId: string, workId: string) {
	if (!(await ownsACopy(env, memberId, workId))) return false;
	const other = await env.DB.prepare(
		`SELECT 1 FROM copies c JOIN editions e ON e.id = c.edition_id
		  WHERE e.work_id = ? AND c.owner_id != ? AND c.state != 'retired'`,
	)
		.bind(workId, memberId)
		.first();
	return !other;
}

function isModerator(env: Env, memberId: string, communityId: string) {
	return env.DB.prepare(
		"SELECT 1 FROM memberships WHERE member_id = ? AND community_id = ? AND role IN ('moderator', 'admin')",
	)
		.bind(memberId, communityId)
		.first()
		.then(Boolean);
}
