import type { Env } from "./env.ts";
import { ulid, now } from "./ids.ts";
import { hashToken, newToken } from "./tokens.ts";

export async function createInvite(
	env: Env,
	communityId: string,
	createdBy: string,
	maxUses: number,
	days: number,
	sentTo: string | null = null,
) {
	const id = ulid();
	const token = newToken();
	const expiresAt = now() + days * 86_400;
	await env.DB.prepare(
		`INSERT INTO invites (id, community_id, created_by, token_hash, max_uses, uses, expires_at, created_at, sent_to)
		 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
	)
		.bind(
			id,
			communityId,
			createdBy,
			await hashToken(token),
			maxUses,
			expiresAt,
			now(),
			sentTo,
		)
		.run();
	return { id, token, expiresAt };
}

/**
 * Whoever made the invite still vouches for the people it brings in: a
 * member suspended (or gone) cannot keep bringing anyone. Lifted with the
 * suspension, since nothing about the invite itself changed.
 */
const VOUCHED = `EXISTS (SELECT 1 FROM memberships vm JOIN members vb ON vb.id = vm.member_id
	WHERE vm.member_id = invites.created_by AND vm.community_id = invites.community_id
	  AND vm.status = 'active' AND vb.deactivated_at IS NULL)`;

/** A usable invite, or null. Does not consume it — that happens on exchange. */
export async function findInvite(env: Env, token: string) {
	return env.DB.prepare(
		`SELECT id, community_id FROM invites
		  WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses
		    AND ${VOUCHED}`,
	)
		.bind(await hashToken(token), now())
		.first<{ id: string; community_id: string }>();
}

/**
 * What became of an invite link, for the page it lands on. Only "used" and
 * "expired" are told apart: a withdrawn link or a made-up token reads as
 * usable, and the visitor learns nothing they would not from asking.
 */
export async function inviteState(
	env: Env,
	token: string,
): Promise<"usable" | "used" | "expired"> {
	const row = await env.DB.prepare(
		"SELECT revoked_at, expires_at, uses, max_uses FROM invites WHERE token_hash = ?",
	)
		.bind(await hashToken(token))
		.first<{
			revoked_at: number | null;
			expires_at: number;
			uses: number;
			max_uses: number;
		}>();
	if (!row || row.revoked_at) return "usable";
	if (row.uses >= row.max_uses) return "used";
	if (row.expires_at <= now()) return "expired";
	return "usable";
}

/** Counts a use; returns false if the invite ran out between request and exchange. */
export async function consumeInvite(
	env: Env,
	id: string,
): Promise<{ community_id: string; created_by: string } | null> {
	return env.DB.prepare(
		`UPDATE invites SET uses = uses + 1
		  WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses
		    AND ${VOUCHED}
		  RETURNING community_id, created_by`,
	)
		.bind(id, now())
		.first<{ community_id: string; created_by: string }>();
}
