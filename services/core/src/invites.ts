import type { InviteState } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { ulid, now } from "./ids.ts";
import { hashToken, newToken } from "./tokens.ts";
import { seal, unseal } from "./seal.ts";

/** An event's link: opens and closes at these times (Unix seconds). */
export interface InviteWindow {
	startsAt: number;
	expiresAt: number;
}

const DAY = 86_400;
/** The furthest ahead an event's link may close, and its longest span. */
export const WINDOW_DAYS = 30;

/**
 * Check an event's window: both ends or neither, closing after it opens and
 * after now, no longer than a month, and no further off than one either.
 * Opening a little in the past is fine: "today" began at midnight.
 */
export function windowOf(
	input: { startsAt?: number | undefined; expiresAt?: number | undefined },
	at = now(),
): InviteWindow | null | "invalid" {
	const { startsAt, expiresAt } = input;
	if (startsAt === undefined && expiresAt === undefined) return null;
	if (startsAt === undefined || expiresAt === undefined) return "invalid";
	if (expiresAt <= startsAt || expiresAt <= at) return "invalid";
	if (expiresAt - startsAt > WINDOW_DAYS * DAY) return "invalid";
	if (expiresAt > at + (WINDOW_DAYS + 1) * DAY) return "invalid";
	if (startsAt < at - 2 * DAY) return "invalid";
	return { startsAt, expiresAt };
}

export async function createInvite(
	env: Env,
	communityId: string,
	createdBy: string,
	maxUses: number,
	days: number,
	sentTo: string | null = null,
	window: InviteWindow | null = null,
) {
	const id = ulid();
	const token = newToken();
	const startsAt = window?.startsAt ?? null;
	const expiresAt = window?.expiresAt ?? now() + days * DAY;
	// One sent by email is in the email: nobody needs it shown again.
	const sealed = sentTo ? null : await seal(env, token, id);
	await env.DB.prepare(
		`INSERT INTO invites (id, community_id, created_by, token_hash, max_uses, uses, starts_at, expires_at, created_at, sent_to, token_sealed)
		 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			communityId,
			createdBy,
			await hashToken(token),
			maxUses,
			startsAt,
			expiresAt,
			now(),
			sentTo,
			sealed,
		)
		.run();
	return { id, token, startsAt, expiresAt, showable: sealed !== null };
}

/**
 * The link of an invite again, for whoever made it, while it can still let
 * someone in (an event's link counts before its day: that is when its sign
 * gets printed). Null for anyone else's, one withdrawn, used up or expired,
 * and one whose link was not kept.
 */
export async function inviteLink(env: Env, id: string, createdBy: string) {
	const row = await env.DB.prepare(
		`SELECT token_hash, token_sealed, max_uses, starts_at, expires_at FROM invites
		  WHERE id = ? AND created_by = ? AND revoked_at IS NULL
		    AND expires_at > ? AND uses < max_uses`,
	)
		.bind(id, createdBy, now())
		.first<{
			token_hash: string;
			token_sealed: string | null;
			max_uses: number;
			starts_at: number | null;
			expires_at: number;
		}>();
	if (!row) return null;
	const token = await unseal(env, row.token_sealed, id);
	// The hash is what lets people in: a copy that does not match it is no link.
	if (!token || (await hashToken(token)) !== row.token_hash) return null;
	return {
		id,
		token,
		maxUses: row.max_uses,
		startsAt: row.starts_at,
		expiresAt: row.expires_at,
		showable: true,
	};
}

/** Open now: not withdrawn, not used up, past its opening and before its close. */
const OPEN = `revoked_at IS NULL AND expires_at > ?1 AND uses < max_uses
	AND (starts_at IS NULL OR starts_at <= ?1)`;

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
		  WHERE token_hash = ?2 AND ${OPEN} AND ${VOUCHED}`,
	)
		.bind(now(), await hashToken(token))
		.first<{ id: string; community_id: string }>();
}

/**
 * What became of an invite link, for the page it lands on. A withdrawn link
 * or a made-up token reads as usable and says nothing more: the visitor
 * learns nothing they would not from asking. A real one that is not open
 * says why, and enough for the page to word it: one person's or a group's,
 * an event's day, and whether any member could invite them instead.
 */
export async function inviteState(
	env: Env,
	token: string,
): Promise<InviteState> {
	const row = await env.DB.prepare(
		`SELECT i.revoked_at, i.starts_at, i.expires_at, i.uses, i.max_uses,
		        c.member_invites_open
		   FROM invites i JOIN communities c ON c.id = i.community_id
		  WHERE i.token_hash = ?`,
	)
		.bind(await hashToken(token))
		.first<{
			revoked_at: number | null;
			starts_at: number | null;
			expires_at: number;
			uses: number;
			max_uses: number;
			member_invites_open: number;
		}>();
	if (!row || row.revoked_at) return { state: "usable" };
	const at = now();
	const state =
		row.uses >= row.max_uses
			? "used"
			: row.expires_at <= at
				? "expired"
				: row.starts_at !== null && row.starts_at > at
					? "early"
					: "usable";
	if (state === "usable") return { state };
	return {
		state,
		maxUses: row.max_uses,
		startsAt: row.starts_at,
		expiresAt: row.expires_at,
		membersInvite: row.member_invites_open > 0,
	};
}

/** Counts a use; returns false if the invite ran out between request and exchange. */
export async function consumeInvite(
	env: Env,
	id: string,
): Promise<{ community_id: string; created_by: string } | null> {
	return env.DB.prepare(
		`UPDATE invites SET uses = uses + 1
		  WHERE id = ?2 AND ${OPEN} AND ${VOUCHED}
		  RETURNING community_id, created_by`,
	)
		.bind(now(), id)
		.first<{ community_id: string; created_by: string }>();
}
