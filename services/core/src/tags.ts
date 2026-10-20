import { groupTags, type TagMatch, type Vocabulary } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { forget, fragment, vocabularyKey } from "./cache.ts";
import {
	NAMESPACE_FOR_LIBRARY,
	TAG_IN_COMMUNITY,
} from "./community-catalogue.ts";
import { now } from "./ids.ts";

/**
 * The vocabulary, with how many works in this community carry each tag. One
 * query for the chips, the pickers and the filter row.
 */
/** Long enough to matter, short enough that a new book counts within a minute. */
const VOCABULARY_TTL = 60;

export async function vocabulary(
	env: Env,
	communityId: string,
): Promise<Vocabulary & { counts: Map<string, number> }> {
	const [namespaces, tags, counts] = await Promise.all([
		env.DB.prepare(
			`SELECT id, label_en, label_he, builtin FROM tag_namespaces n
			  WHERE ${NAMESPACE_FOR_LIBRARY} ORDER BY position, id`,
		).all<{
			id: string;
			label_en: string;
			label_he: string;
			builtin: number;
		}>(),
		env.DB.prepare(
			`SELECT t.slug, t.namespace, t.value, t.label_en, t.label_he, t.builtin
			   FROM tags t JOIN tag_namespaces n ON n.id = t.namespace
			  WHERE ${TAG_IN_COMMUNITY}
			  ORDER BY n.position, n.id, t.position, t.value`,
		)
			.bind(communityId)
			.all<{
				slug: string;
				namespace: string;
				value: string;
				label_en: string;
				label_he: string;
				builtin: number;
			}>(),
		env.DB.prepare(
			`SELECT wt.tag, count(DISTINCT wt.work_id) AS works
			   FROM work_tags wt
			  WHERE EXISTS (
			    SELECT 1 FROM editions e JOIN copies c ON c.edition_id = e.id
			      JOIN copy_shares cs ON cs.copy_id = c.id
			     WHERE e.work_id = wt.work_id AND cs.community_id = ? AND c.state != 'retired')
			  GROUP BY wt.tag`,
		)
			.bind(communityId)
			.all<{ tag: string; works: number }>(),
	]);

	const used = new Map(counts.results.map((row) => [row.tag, row.works]));
	// Namespace order follows the tags, so an empty namespace never shows a header.
	return {
		namespaces: namespaces.results.map((row) => ({
			id: row.id,
			labels: { en: row.label_en, he: row.label_he },
			builtin: row.builtin === 1,
		})),
		tags: tags.results.map((row) => ({
			slug: row.slug,
			namespace: row.namespace,
			value: row.value,
			labels: { en: row.label_en, he: row.label_he },
			builtin: row.builtin === 1,
			works: used.get(row.slug) ?? 0,
		})),
		counts: used,
	};
}

/**
 * The same vocabulary, from the cache when there is one. Every listing page
 * asks for it, it is the same for the whole community, and the count query
 * behind it is the most expensive read on that path.
 */
export async function cachedVocabulary(
	env: Env,
	ctx: { waitUntil(promise: Promise<unknown>): void } | undefined,
	communityId: string,
): Promise<Vocabulary & { counts: Map<string, number> }> {
	const stored = await fragment(
		env,
		ctx,
		vocabularyKey(communityId),
		VOCABULARY_TTL,
		async (): Promise<Vocabulary> => {
			const { namespaces, tags } = await vocabulary(env, communityId);
			return { namespaces, tags };
		},
	);
	return {
		...stored,
		counts: new Map(stored.tags.map((tag) => [tag.slug, tag.works])),
	};
}

/** Slugs this community's vocabulary has, in its order. Everything else is dropped. */
export async function knownTags(
	env: Env,
	slugs: string[],
	communityId: string,
): Promise<string[]> {
	if (slugs.length === 0) return [];
	const unique = [...new Set(slugs)];
	const pages = await Promise.all(
		batches(unique).map((group) =>
			env.DB.prepare(
				`SELECT t.slug FROM tags t JOIN tag_namespaces n ON n.id = t.namespace
				  WHERE t.slug IN (${group.map(() => "?").join(", ")})
				    AND ${TAG_IN_COMMUNITY}
				  ORDER BY n.position, n.id, t.position, t.value`,
			)
				.bind(...group, communityId)
				.all<{ slug: string }>(),
		),
	);
	return pages.flatMap((page) => page.results.map((row) => row.slug));
}

/**
 * D1 takes at most a hundred bound values in one statement, and a page of the
 * storefront is grouped from a window of four hundred copies — so a listing
 * wide enough to matter has to ask in batches.
 */
const BIND_LIMIT = 90;

function batches<T>(values: T[], size = BIND_LIMIT): T[][] {
	const out: T[][] = [];
	for (let at = 0; at < values.length; at += size) {
		out.push(values.slice(at, at + size));
	}
	return out;
}

/** Tags for a set of works, in vocabulary order so chips never jump about. */
export async function tagsForWorks(
	env: Env,
	workIds: string[],
): Promise<Map<string, string[]>> {
	const byWork = new Map<string, string[]>();
	if (workIds.length === 0) return byWork;
	const unique = [...new Set(workIds)];

	const pages = await Promise.all(
		batches(unique).map((group) =>
			env.DB.prepare(
				`SELECT wt.work_id, wt.tag FROM work_tags wt
				   JOIN tags t ON t.slug = wt.tag
				   JOIN tag_namespaces n ON n.id = t.namespace
				  WHERE wt.work_id IN (${group.map(() => "?").join(", ")})
				  ORDER BY n.position, n.id, t.position, t.value`,
			)
				.bind(...group)
				.all<{ work_id: string; tag: string }>(),
		),
	);
	for (const page of pages) {
		for (const row of page.results) {
			byWork.set(row.work_id, [...(byWork.get(row.work_id) ?? []), row.tag]);
		}
	}
	return byWork;
}

export async function tagsForWork(env: Env, workId: string): Promise<string[]> {
	return (await tagsForWorks(env, [workId])).get(workId) ?? [];
}

/**
 * The filter, as SQL fragments over `e.work_id`. Facets are one EXISTS per
 * namespace — OR inside each, AND between them (contracts/tags.ts).
 */
export function tagConditions(
	tags: string[],
	match: TagMatch = "facets",
): { sql: string[]; binds: string[] } {
	if (tags.length === 0) return { sql: [], binds: [] };
	const exists = (group: string[]) =>
		`EXISTS (SELECT 1 FROM work_tags wt WHERE wt.work_id = e.work_id AND wt.tag IN (${group
			.map(() => "?")
			.join(", ")}))`;

	const groups =
		match === "any"
			? [tags]
			: match === "all"
				? tags.map((tag) => [tag])
				: [...groupTags(tags).values()];
	return { sql: groups.map(exists), binds: groups.flat() };
}

/** Replace a work's tags wholesale; the editor sends the full set. */
export async function setWorkTags(
	env: Env,
	workId: string,
	tags: string[],
	memberId: string,
): Promise<void> {
	await forgetVocabulary(env);
	await env.DB.batch([
		env.DB.prepare("DELETE FROM work_tags WHERE work_id = ?").bind(workId),
		...tags.map((tag) =>
			env.DB.prepare(
				"INSERT OR IGNORE INTO work_tags (work_id, tag, added_by, created_at) VALUES (?, ?, ?, ?)",
			).bind(workId, tag, memberId, now()),
		),
	]);
}

/**
 * The counts in the vocabulary are per community, and a write here changes
 * them for every community that shares the work. There are few enough of them
 * that forgetting all is cheaper than working out which.
 */
async function forgetVocabulary(env: Env): Promise<void> {
	const { results } = await env.DB.prepare("SELECT id FROM communities").all<{
		id: string;
	}>();
	await forget(env, ...results.map((row) => vocabularyKey(row.id)));
}

/** Add tags without removing any: listing a book seeds what the provider knows. */
export async function addWorkTags(
	env: Env,
	workId: string,
	tags: string[],
	memberId: string,
): Promise<void> {
	if (tags.length === 0) return;
	await forgetVocabulary(env);
	await env.DB.batch(
		tags.map((tag) =>
			env.DB.prepare(
				"INSERT OR IGNORE INTO work_tags (work_id, tag, added_by, created_at) VALUES (?, ?, ?, ?)",
			).bind(workId, tag, memberId, now()),
		),
	);
}

/** A provider's language code becomes a tag; anything exotic is "other". */
export function languageTag(
	language: string | null | undefined,
): string | null {
	if (!language) return null;
	const code = language.trim().toLowerCase().slice(0, 2);
	if (code === "he" || code === "iw") return "language:he";
	if (code === "en") return "language:en";
	return "language:other";
}
