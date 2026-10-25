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

/** Wrong codes a browser may type before the code is spent. */
export const CODE_TRIES = 5;

/**
 * A one-shot link. Given the asking browser's value, the link also gets an
 * eight-digit code that signs in that browser alone; either spends both.
 * Eight, not six: a code allows CODE_TRIES guesses and an address gets at
 * most five codes a day (routes-auth.ts), so a stranger has about a one in
 * four million chance a day, and the member would see the emails first.
 */
export async function createMagicLink(
	env: Env,
	email: string,
	inviteId: string | null,
	minutes = MAGIC_LINK_MINUTES,
	browser: string | null = null,
): Promise<{ token: string; code: string | null }> {
	const token = newToken();
	const code = browser ? eightDigits() : null;
	await env.DB.prepare(
		`INSERT INTO magic_links (id, email, token_hash, invite_id, expires_at, created_at, browser_hash, code_hash)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			ulid(),
			email,
			await hashToken(token),
			inviteId,
			now() + minutes * 60,
			now(),
			browser ? await hashToken(browser) : null,
			browser && code ? await hashToken(`${browser}:${code}`) : null,
		)
		.run();
	return { token, code };
}

/** Uniform over 00000000–99999999: draws past the last whole hundred million are drawn again. */
function eightDigits(): string {
	const limit = 0x1_0000_0000 - (0x1_0000_0000 % 100_000_000);
	for (;;) {
		const [value] = crypto.getRandomValues(new Uint32Array(1));
		if (value! < limit) return String(value! % 100_000_000).padStart(8, "0");
	}
}

/**
 * The code typed in the browser that asked for it. Spends the link it came
 * with. Every attempt first spends a try on each live code that browser
 * holds, in one statement, so attempts made at once cannot share a try:
 * CODE_TRIES is a hard ceiling, the right code's attempt included.
 */
export async function consumeCode(env: Env, browser: string, code: string) {
	const { results } = await env.DB.prepare(
		`UPDATE magic_links SET code_tries = code_tries + 1
		  WHERE browser_hash = ? AND code_hash IS NOT NULL AND used_at IS NULL
		    AND expires_at > ? AND code_tries < ?
		  RETURNING id, code_hash`,
	)
		.bind(await hashToken(browser), now(), CODE_TRIES)
		.all<{ id: string; code_hash: string }>();
	const wanted = await hashToken(`${browser}:${code}`);
	const match = results.find((row) => row.code_hash === wanted);
	if (!match) return null;
	const row = await env.DB.prepare(
		`UPDATE magic_links SET used_at = ?
		  WHERE id = ? AND used_at IS NULL
		  RETURNING email, invite_id`,
	)
		.bind(now(), match.id)
		.first<{ email: string; invite_id: string | null }>();
	return row ?? null;
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
