import type { Scope } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { ulid, now } from "./ids.ts";
import { hashToken, newToken } from "./tokens.ts";

const CONSENT_MINUTES = 5;
const TOKEN_DAYS = 365;

/** Mint a scoped token and a one-time code that the OAuth server redeems for it. */
export async function mintTokenWithConsent(
	env: Env,
	memberId: string,
	clientName: string,
	scopes: Scope[],
) {
	const id = ulid();
	const token = newToken();
	const code = newToken();
	const at = now();
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO access_tokens (id, member_id, token_hash, scopes, client_name, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			id,
			memberId,
			await hashToken(token),
			scopes.join(" "),
			clientName,
			at,
			at + TOKEN_DAYS * 86_400,
		),
		env.DB.prepare(
			"INSERT INTO consent_codes (code_hash, token_id, expires_at) VALUES (?, ?, ?)",
		).bind(await hashToken(code), id, at + CONSENT_MINUTES * 60),
	]);
	// The plain token is kept only until the code is redeemed; see redeemConsent.
	await env.DB.prepare(
		"UPDATE consent_codes SET token_plain = ? WHERE code_hash = ?",
	)
		.bind(token, await hashToken(code))
		.run();
	return { code, expiresAt: at + CONSENT_MINUTES * 60 };
}

/** A personal token for the member's own scripts. The plain value is returned once. */
export async function mintToken(
	env: Env,
	memberId: string,
	clientName: string,
	scopes: Scope[],
) {
	const id = ulid();
	const token = newToken();
	const at = now();
	const expiresAt = at + TOKEN_DAYS * 86_400;
	await env.DB.prepare(
		`INSERT INTO access_tokens (id, member_id, token_hash, scopes, client_name, created_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			memberId,
			await hashToken(token),
			scopes.join(" "),
			clientName,
			at,
			expiresAt,
		)
		.run();
	return { id, token, clientName, scopes, expiresAt };
}

/** One shot: returns the token and who it belongs to, then forgets the plain value. */
export async function redeemConsent(env: Env, code: string) {
	const hash = await hashToken(code);
	const row = await env.DB.prepare(
		`UPDATE consent_codes SET used_at = ?
		  WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
		  RETURNING token_id, token_plain`,
	)
		.bind(now(), hash, now())
		.first<{ token_id: string; token_plain: string | null }>();
	if (!row?.token_plain) return null;
	await env.DB.prepare(
		"UPDATE consent_codes SET token_plain = NULL WHERE code_hash = ?",
	)
		.bind(hash)
		.run();
	const token = await env.DB.prepare(
		"SELECT member_id, scopes, client_name FROM access_tokens WHERE id = ?",
	)
		.bind(row.token_id)
		.first<{ member_id: string; scopes: string; client_name: string }>();
	if (!token) return null;
	// Approving the same assistant again replaces the last connection rather
	// than adding one beside it: one live token per client, per member. Only
	// now it is collected, so an approval abandoned half-way leaves the
	// working connection be.
	await env.DB.prepare(
		`UPDATE access_tokens SET revoked_at = ?
		  WHERE member_id = ? AND client_name = ? AND id != ? AND revoked_at IS NULL`,
	)
		.bind(now(), token.member_id, token.client_name, row.token_id)
		.run();
	return {
		token: row.token_plain,
		memberId: token.member_id,
		scopes: token.scopes.split(" ") as Scope[],
		clientName: token.client_name,
	};
}

/** Resolves a bearer access token; touches last_used at most hourly. */
export async function memberForAccessToken(
	env: Env,
	token: string,
): Promise<{ memberId: string; scopes: Scope[]; clientName: string } | null> {
	const row = await env.DB.prepare(
		`SELECT id, member_id, scopes, last_used_at, client_name FROM access_tokens
		  WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`,
	)
		.bind(await hashToken(token), now())
		.first<{
			id: string;
			member_id: string;
			scopes: string;
			last_used_at: number | null;
			client_name: string;
		}>();
	if (!row) return null;
	if (!row.last_used_at || now() - row.last_used_at > 3600) {
		await env.DB.prepare(
			"UPDATE access_tokens SET last_used_at = ? WHERE id = ?",
		)
			.bind(now(), row.id)
			.run();
	}
	return {
		memberId: row.member_id,
		scopes: row.scopes.split(" ") as Scope[],
		clientName: row.client_name,
	};
}

/**
 * A consent screen mints the token before the assistant collects it, so an
 * approval that is abandoned — or blocked on its way back — leaves a token
 * nobody holds. Once the five-minute code has expired unredeemed, that token
 * is nothing but clutter on the member's list of connections.
 */
export async function revokeAbandonedConsents(env: Env): Promise<number> {
	const result = await env.DB.prepare(
		`UPDATE access_tokens SET revoked_at = ?
		  WHERE revoked_at IS NULL AND last_used_at IS NULL
		    AND id IN (SELECT token_id FROM consent_codes
		                WHERE used_at IS NULL AND expires_at <= ?)`,
	)
		.bind(now(), now())
		.run();
	return result.meta.changes ?? 0;
}

export async function listTokens(env: Env, memberId: string) {
	const { results } = await env.DB.prepare(
		`SELECT id, client_name, scopes, created_at, last_used_at, expires_at FROM access_tokens
		  WHERE member_id = ? AND revoked_at IS NULL
		    -- An approval its assistant has not collected yet is no connection.
		    AND NOT EXISTS (SELECT 1 FROM consent_codes cc
		                     WHERE cc.token_id = access_tokens.id AND cc.used_at IS NULL)
		  ORDER BY created_at DESC`,
	)
		.bind(memberId)
		.all<{
			id: string;
			client_name: string;
			scopes: string;
			created_at: number;
			last_used_at: number | null;
			expires_at: number | null;
		}>();
	return results.map((row) => ({
		id: row.id,
		clientName: row.client_name,
		scopes: row.scopes.split(" ") as Scope[],
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		expiresAt: row.expires_at,
	}));
}

export async function revokeToken(
	env: Env,
	memberId: string,
	id: string,
): Promise<boolean> {
	const result = await env.DB.prepare(
		"UPDATE access_tokens SET revoked_at = ? WHERE id = ? AND member_id = ? AND revoked_at IS NULL",
	)
		.bind(now(), id, memberId)
		.run();
	return Boolean(result.meta.changes);
}
