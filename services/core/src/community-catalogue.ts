import type { Env } from "./env.ts";
import { now } from "./ids.ts";

/**
 * Which communities a book belongs to. A book joins a community when a copy
 * of it is shared there or somebody there asks for it, and may belong to
 * several; the moderators of each may look after it, and none of them may
 * reach a book that is not theirs.
 */
export function linkWork(
	env: Env,
	workId: string,
	communityId: string,
): D1PreparedStatement {
	return env.DB.prepare(
		"INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at) VALUES (?, ?, ?)",
	).bind(workId, communityId, now());
}

export async function workInCommunity(
	env: Env,
	workId: string,
	communityId: string,
): Promise<boolean> {
	const row = await env.DB.prepare(
		"SELECT 1 AS yes FROM work_communities WHERE work_id = ? AND community_id = ?",
	)
		.bind(workId, communityId)
		.first();
	return Boolean(row);
}

/**
 * SQL that is true when namespace `n` belongs to this library's type: one
 * library per database, so its type is the one row's.
 */
export const NAMESPACE_FOR_LIBRARY = `(n.library_type IS NULL
	OR n.library_type = (SELECT type FROM communities))`;

/**
 * SQL that is true when tag `t` is in the community bound as the parameter: a
 * built-in tag of a namespace for this library's type, or one linked to it.
 */
export const TAG_IN_COMMUNITY = `((t.builtin = 1 AND EXISTS (
	SELECT 1 FROM tag_namespaces n WHERE n.id = t.namespace AND ${NAMESPACE_FOR_LIBRARY}))
	OR EXISTS (
	SELECT 1 FROM tag_communities tc WHERE tc.tag_id = t.id AND tc.community_id = ?))`;

/**
 * How many other communities would feel a change to this tag: those it is
 * linked to besides this one, or for a built-in tag, every other community.
 */
export async function tagSharedWith(
	env: Env,
	tag: { id: string; builtin: number },
	communityId: string,
): Promise<number> {
	const row = tag.builtin
		? await env.DB.prepare(
				"SELECT count(*) AS n FROM communities WHERE id != ?",
			)
				.bind(communityId)
				.first<{ n: number }>()
		: await env.DB.prepare(
				"SELECT count(*) AS n FROM tag_communities WHERE tag_id = ? AND community_id != ?",
			)
				.bind(tag.id, communityId)
				.first<{ n: number }>();
	return row?.n ?? 0;
}
