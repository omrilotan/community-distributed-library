import type { Env } from "./env.ts";
import { searchKey } from "./normalise.ts";
import { now } from "./ids.ts";

/**
 * Two members listing one book by hand will not spell it the same way, and a
 * work is keyed on its title and authors. Rather than guess, we look for near
 * matches and let a person say. Nothing here merges anything by itself: nine
 * books on these shelves differ by a single digit.
 */

export interface Candidate {
	id: string;
	title: string;
	authors: string[];
	coverUrl: string | null;
	/** How close, 0–1. Only used to order what a person is shown. */
	score: number;
	/** Who in the community has a copy, for recognising the book. */
	owners: string[];
}

const MIN_SCORE = 0.6;

const words = (value: string) =>
	new Set(searchKey(value).split(" ").filter(Boolean));

/** Digit runs, in order: "דוד אריה 1" and "דוד אריה 10" must never match. */
const numbers = (value: string) => (value.match(/\d+/g) ?? []).join(",");

export function similarity(
	a: { title: string; authors: string[] },
	b: { title: string; authors: string[] },
): number {
	// A series number is the whole difference between two books, so it decides
	// first: differing numbers mean different books, however alike the rest is.
	if (numbers(a.title) !== numbers(b.title)) return 0;

	const authorsA = words(a.authors.join(" "));
	const authorsB = words(b.authors.join(" "));
	const sharedAuthor = [...authorsA].some((token) => authorsB.has(token));
	if (!sharedAuthor && authorsA.size > 0 && authorsB.size > 0) return 0;

	const keyA = searchKey(a.title);
	const keyB = searchKey(b.title);
	if (keyA === keyB) return 1;
	// One title being the whole of the other is the common case: a subtitle
	// that one member typed and the other did not.
	if (keyA.includes(keyB) || keyB.includes(keyA)) return 0.9;

	const titleA = words(a.title);
	const titleB = words(b.title);
	const shared = [...titleA].filter((token) => titleB.has(token)).length;
	const smaller = Math.min(titleA.size, titleB.size);
	return smaller === 0 ? 0 : shared / smaller;
}

interface Named {
	id: string;
	title: string;
	authors: string[];
}

/**
 * Every book with a copy on this community's shelves: only what the
 * comparison needs. Titles and authors are cheap; covers and owners are
 * fetched afterwards, for the few that turn out to be candidates.
 */
async function communityWorks(env: Env, communityId: string): Promise<Named[]> {
	const { results } = await env.DB.prepare(
		`SELECT w.id, w.title, w.authors FROM works w
		  WHERE EXISTS (
		    SELECT 1 FROM editions e JOIN copies c ON c.edition_id = e.id
		      JOIN copy_shares cs ON cs.copy_id = c.id
		     WHERE e.work_id = w.id AND cs.community_id = ? AND c.state != 'retired')`,
	)
		.bind(communityId)
		.all<{ id: string; title: string; authors: string }>();
	return results.map((row) => ({
		id: row.id,
		title: row.title,
		authors: JSON.parse(row.authors) as string[],
	}));
}

/** Pairs a person has said are different, as "a:b" with a < b. */
async function distinctPairs(env: Env): Promise<Set<string>> {
	const { results } = await env.DB.prepare(
		"SELECT a_id, b_id FROM work_distinct",
	).all<{ a_id: string; b_id: string }>();
	return new Set(results.map((row) => `${row.a_id}:${row.b_id}`));
}

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** A cover and the owners' names, for the works a person is about to see. */
async function describe(
	env: Env,
	works: (Named & { score: number })[],
): Promise<Candidate[]> {
	if (works.length === 0) return [];
	const details = new Map<string, { cover: string | null; owners: string[] }>();
	// D1 binds a hundred values at most; a page never needs that many.
	for (let at = 0; at < works.length; at += 50) {
		const group = works.slice(at, at + 50).map((work) => work.id);
		const { results } = await env.DB.prepare(
			`SELECT w.id,
			        (SELECT e.cover_url FROM editions e
			          WHERE e.work_id = w.id AND e.cover_url IS NOT NULL LIMIT 1) AS cover_url,
			        (SELECT group_concat(DISTINCT m.display_name)
			           FROM editions e JOIN copies c ON c.edition_id = e.id
			           JOIN members m ON m.id = c.owner_id
			          WHERE e.work_id = w.id AND c.state != 'retired') AS owners
			   FROM works w WHERE w.id IN (${group.map(() => "?").join(", ")})`,
		)
			.bind(...group)
			.all<{ id: string; cover_url: string | null; owners: string | null }>();
		for (const row of results)
			details.set(row.id, {
				cover: row.cover_url,
				owners: row.owners ? row.owners.split(",") : [],
			});
	}
	return works.map((work) => ({
		...work,
		coverUrl: details.get(work.id)?.cover ?? null,
		owners: details.get(work.id)?.owners ?? [],
	}));
}

/** Works in this community that might be the same book as `work`. */
export async function similarWorks(
	env: Env,
	communityId: string,
	work: Named,
	limit = 3,
): Promise<Candidate[]> {
	const [works, distinct] = await Promise.all([
		communityWorks(env, communityId),
		distinctPairs(env),
	]);
	const near = works
		.filter(
			(other) =>
				other.id !== work.id && !distinct.has(pairKey(work.id, other.id)),
		)
		.map((other) => ({ ...other, score: similarity(work, other) }))
		.filter((candidate) => candidate.score >= MIN_SCORE)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
	return describe(env, near);
}

/**
 * Every suspected pair in the community, each once, closest first. One read
 * of the books, every pair compared in memory: the shelves hold hundreds of
 * books, not millions, and a comparison is a few string operations.
 */
export async function duplicatePairs(
	env: Env,
	communityId: string,
): Promise<{ left: Candidate; right: Candidate }[]> {
	const [works, distinct] = await Promise.all([
		communityWorks(env, communityId),
		distinctPairs(env),
	]);
	const found: { left: Named; right: Named & { score: number } }[] = [];
	for (let i = 0; i < works.length; i++) {
		for (let j = i + 1; j < works.length; j++) {
			const left = works[i]!;
			const right = works[j]!;
			if (distinct.has(pairKey(left.id, right.id))) continue;
			const score = similarity(left, right);
			if (score >= MIN_SCORE) found.push({ left, right: { ...right, score } });
		}
	}
	found.sort((a, b) => b.right.score - a.right.score);
	const rights = await describe(
		env,
		found.map((pair) => pair.right),
	);
	return found.map((pair, index) => ({
		left: { ...pair.left, coverUrl: null, owners: [], score: pair.right.score },
		right: rights[index]!,
	}));
}

/**
 * Fold `sourceId` into `targetId`: the editions, and everything else that
 * points at a work, move across. The source is then gone, so the copies that
 * were under it are now copies of one book.
 */
export async function mergeWorks(
	env: Env,
	sourceId: string,
	targetId: string,
	keepTitle?: { title: string; authors: string[] },
): Promise<void> {
	if (sourceId === targetId) return;
	const statements = [
		env.DB.prepare("UPDATE editions SET work_id = ? WHERE work_id = ?").bind(
			targetId,
			sourceId,
		),
		// The target may already carry a tag the source had.
		env.DB.prepare(
			"INSERT OR IGNORE INTO work_tags (work_id, tag, added_by, created_at) SELECT ?, tag, added_by, created_at FROM work_tags WHERE work_id = ?",
		).bind(targetId, sourceId),
		env.DB.prepare("DELETE FROM work_tags WHERE work_id = ?").bind(sourceId),
		// Somebody waiting for the source is waiting for the same book.
		env.DB.prepare(
			"UPDATE OR IGNORE waitlist SET work_id = ? WHERE work_id = ?",
		).bind(targetId, sourceId),
		env.DB.prepare("DELETE FROM waitlist WHERE work_id = ?").bind(sourceId),
		// Read one, read both.
		env.DB.prepare(
			"UPDATE OR IGNORE read_works SET work_id = ? WHERE work_id = ?",
		).bind(targetId, sourceId),
		env.DB.prepare("DELETE FROM read_works WHERE work_id = ?").bind(sourceId),
		env.DB.prepare(
			"UPDATE OR IGNORE wishlist SET work_id = ? WHERE work_id = ?",
		).bind(targetId, sourceId),
		env.DB.prepare("DELETE FROM wishlist WHERE work_id = ?").bind(sourceId),
		env.DB.prepare(
			"UPDATE tag_proposals SET work_id = ? WHERE work_id = ?",
		).bind(targetId, sourceId),
		env.DB.prepare(
			"DELETE FROM work_distinct WHERE a_id = ?1 OR b_id = ?1",
		).bind(sourceId),
		// The merged book belongs everywhere either of the two did.
		env.DB.prepare(
			"INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at) SELECT ?, community_id, created_at FROM work_communities WHERE work_id = ?",
		).bind(targetId, sourceId),
		env.DB.prepare("DELETE FROM work_communities WHERE work_id = ?").bind(
			sourceId,
		),
		env.DB.prepare("DELETE FROM works WHERE id = ?").bind(sourceId),
	];
	if (keepTitle) {
		statements.unshift(
			env.DB.prepare(
				"UPDATE works SET title = ?, authors = ?, search_key = ? WHERE id = ?",
			).bind(
				keepTitle.title,
				JSON.stringify(keepTitle.authors),
				searchKey(`${keepTitle.title} ${keepTitle.authors.join(" ")}`),
				targetId,
			),
		);
	}
	await env.DB.batch(statements);
}

/** Remember that a person looked at these two and said they differ. */
export async function markDistinct(
	env: Env,
	a: string,
	b: string,
	memberId: string,
): Promise<void> {
	const [first, second] = a < b ? [a, b] : [b, a];
	await env.DB.prepare(
		"INSERT OR IGNORE INTO work_distinct (a_id, b_id, decided_by, created_at) VALUES (?, ?, ?, ?)",
	)
		.bind(first, second, memberId, now())
		.run();
}
