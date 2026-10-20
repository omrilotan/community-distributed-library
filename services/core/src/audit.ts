import type { Env } from "./env.ts";
import { ulid, now } from "./ids.ts";

/**
 * The moderation log. Every successful change through /v1/admin is written
 * here by the middleware in routes-admin.ts, so no route can forget; the
 * few moderator powers used outside it (merging another's book, tagging any
 * book) call record() themselves.
 */
const DETAILS_MAX = 500;

export interface Entry {
	communityId: string;
	actorId: string;
	action: string;
	target: string | null;
	details: string | null;
	/** The assistant that made the change, if not the site. */
	via?: string | null;
}

export async function record(env: Env, entry: Entry): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO moderation_log (id, community_id, actor_id, action, target, details, created_at, via)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			ulid(),
			entry.communityId,
			entry.actorId,
			entry.action,
			entry.target,
			entry.details ? entry.details.slice(0, DETAILS_MAX) : null,
			now(),
			entry.via ?? null,
		)
		.run();
}

/**
 * The change as the route that handled it names it ("POST
 * /v1/admin/members/:id/role"), and what it was done to: the value of the
 * route's first parameter in the path that was called.
 */
export function describe(
	method: string,
	pattern: string,
	path: string,
): { action: string; target: string | null } {
	const shape = pattern.split("/");
	const parts = path.split("/");
	const at = shape.findIndex((segment) => segment.startsWith(":"));
	const raw = at >= 0 ? parts[at] : undefined;
	return {
		action: `${method} ${pattern}`,
		target: raw ? decodeURIComponent(raw) : null,
	};
}
