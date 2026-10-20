import type { Env } from "./env.ts";
import { ulid, now } from "./ids.ts";
import { hashToken, newToken } from "./tokens.ts";

export const SESSION_DAYS = 90;
export const MAGIC_LINK_MINUTES = 15;

export async function createSession(env: Env, memberId: string) {
	const token = newToken();
	const expiresAt = now() + SESSION_DAYS * 86_400;
	await env.DB.prepare(
		`INSERT INTO sessions (id, member_id, token_hash, created_at, expires_at, last_seen_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	)
		.bind(ulid(), memberId, await hashToken(token), now(), expiresAt, now())
		.run();
	return { token, expiresAt };
}

export async function revokeSession(env: Env, token: string): Promise<void> {
	const hash = await hashToken(token);
	await env.DB.batch([
		// The browser signed out of stops hearing the member's news.
		env.DB.prepare(
			"DELETE FROM push_subscriptions WHERE session_id = (SELECT id FROM sessions WHERE token_hash = ?)",
		).bind(hash),
		env.DB.prepare(
			"UPDATE sessions SET revoked_at = ? WHERE token_hash = ?",
		).bind(now(), hash),
	]);
}

export async function createMagicLink(
	env: Env,
	email: string,
	inviteId: string | null,
	minutes = MAGIC_LINK_MINUTES,
) {
	const token = newToken();
	await env.DB.prepare(
		`INSERT INTO magic_links (id, email, token_hash, invite_id, expires_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			ulid(),
			email,
			await hashToken(token),
			inviteId,
			now() + minutes * 60,
			now(),
		)
		.run();
	return token;
}

/** One-shot: marks the link used in the same statement that reads it. */
export async function consumeMagicLink(env: Env, token: string) {
	const hash = await hashToken(token);
	const row = await env.DB.prepare(
		`UPDATE magic_links SET used_at = ?
		  WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
		  RETURNING email, invite_id`,
	)
		.bind(now(), hash, now())
		.first<{ email: string; invite_id: string | null }>();
	return row ?? null;
}
