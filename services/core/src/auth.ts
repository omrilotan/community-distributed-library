import type { Context } from "hono";
import type { Env } from "./env.ts";
import { hashToken } from "./tokens.ts";
import { memberForAccessToken } from "./tokens-store.ts";
import { SCOPES, type Scope } from "@cdl/contracts";
import { now } from "./ids.ts";

export interface Viewer {
	id: string;
	communityId: string;
	area: { lat: number; lng: number } | null;
	/** What this caller may do. Sessions and the dev header get everything. */
	scopes: readonly Scope[];
	/** Signed in on the site, as opposed to a token handed to an assistant. */
	session: boolean;
	/** That sign-in, when it is a real one (not the development header). */
	sessionId: string | null;
	/** The assistant acting for them, by the name they approved; null on the site. */
	client: string | null;
	/** Their role here; what moderator() and libraryAdmin() go by. */
	role: "member" | "moderator" | "admin";
	/** The library has everyone close by: no areas or distances anywhere. */
	compact: boolean;
}

/** One lookup per request, however many guards ask. */
const resolved = new WeakMap<object, Promise<Viewer | null>>();

/**
 * Who is calling. A bearer session token is the real path; the X-Member-Id
 * header is a development convenience that only works under DEV_AUTH.
 */
export function viewer<E extends { Bindings: Env }>(
	c: Context<E>,
): Promise<Viewer | null> {
	const key = c.req.raw;
	let pending = resolved.get(key);
	if (!pending) {
		pending = resolve(c);
		resolved.set(key, pending);
	}
	return pending;
}

const MEMBER = `m.id, m.area_lat, m.area_lng, m.last_seen_at, ms.community_id, ms.role, co.compact`;
const JOINS = `JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'active'
	JOIN communities co ON co.id = ms.community_id`;

interface MemberRow {
	id: string;
	area_lat: number | null;
	area_lng: number | null;
	last_seen_at: number | null;
	community_id: string;
	role: Viewer["role"];
	compact: number;
}

async function resolve<E extends { Bindings: Env }>(
	c: Context<E>,
): Promise<Viewer | null> {
	const at = now();
	const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	let row: (MemberRow & { session_id?: string; seen?: number }) | null = null;
	let caller: Pick<Viewer, "scopes" | "session" | "client"> | null = null;

	if (bearer) {
		// A session first, in one query with the member it belongs to: the
		// site's path, paid by every page.
		const session = await c.env.DB.prepare(
			`SELECT ${MEMBER}, s.id AS session_id, s.last_seen_at AS seen
			   FROM sessions s JOIN members m ON m.id = s.member_id ${JOINS}
			  WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
			    AND m.deactivated_at IS NULL`,
		)
			.bind(await hashToken(bearer), at)
			.first<MemberRow & { session_id: string; seen: number }>();
		if (session) {
			row = session;
			caller = { scopes: SCOPES, session: true, client: null };
		} else {
			const token = await memberForAccessToken(c.env, bearer);
			if (!token) return null;
			row = await memberRow(c.env, token.memberId);
			caller = {
				scopes: token.scopes,
				session: false,
				client: token.clientName,
			};
		}
	} else if (c.env.DEV_AUTH === "true") {
		const memberId = c.req.header("X-Member-Id");
		if (!memberId) return null;
		row = await memberRow(c.env, memberId);
		caller = { scopes: SCOPES, session: true, client: null };
	}
	if (!row || !caller) return null;

	// "They have seen it": a request from the site itself, written at most
	// once a minute (the session's own mark, hourly). The deferred-email pass
	// reads this to decide whether to bother, so an assistant or a script
	// polling with a token does not count: the member has seen nothing.
	// Off the request's path.
	const touches = [];
	if (caller.session && (!row.last_seen_at || at - row.last_seen_at > 60))
		touches.push(
			c.env.DB.prepare("UPDATE members SET last_seen_at = ? WHERE id = ?").bind(
				at,
				row.id,
			),
		);
	if (row.session_id && at - (row.seen ?? 0) > 3600)
		touches.push(
			c.env.DB.prepare(
				"UPDATE sessions SET last_seen_at = ? WHERE id = ?",
			).bind(at, row.session_id),
		);
	if (touches.length)
		c.executionCtx.waitUntil(
			c.env.DB.batch(touches)
				.then(() => undefined)
				.catch(() => undefined),
		);

	return {
		id: row.id,
		communityId: row.community_id,
		role: row.role,
		...caller,
		sessionId: row.session_id ?? null,
		compact: row.compact === 1,
		// Everyone close by: nothing is measured from where anybody lives.
		area:
			row.compact !== 1 && row.area_lat !== null && row.area_lng !== null
				? { lat: row.area_lat, lng: row.area_lng }
				: null,
	};
}

function memberRow(env: Env, memberId: string) {
	return env.DB.prepare(
		`SELECT ${MEMBER} FROM members m ${JOINS}
		  WHERE m.id = ? AND m.deactivated_at IS NULL`,
	)
		.bind(memberId)
		.first<MemberRow>();
}

/**
 * The viewer, only if they moderate their community and their credential
 * says so: a moderator's token without the admin scope acts as a member.
 */
export async function moderator<E extends { Bindings: Env }>(
	c: Context<E>,
): Promise<Viewer | null> {
	const member = await viewer(c);
	if (!member || !member.scopes.includes("admin")) return null;
	return member.role === "moderator" || member.role === "admin" ? member : null;
}

/**
 * The viewer, only if they are the library's admin (and their credential
 * carries the admin scope). Everything a moderator can do, and what is the
 * admin's alone: messages to the library, tracing invitations back.
 */
export async function libraryAdmin<E extends { Bindings: Env }>(
	c: Context<E>,
): Promise<Viewer | null> {
	const member = await moderator(c);
	return member?.role === "admin" ? member : null;
}

/** The viewer, if their credential carries the scope. Null otherwise — the route answers 401/403. */
export async function viewerWith<E extends { Bindings: Env }>(
	c: Context<E>,
	scope: Scope,
): Promise<{ member: Viewer | null; forbidden: boolean }> {
	const member = await viewer(c);
	if (!member) return { member: null, forbidden: false };
	if (!member.scopes.includes(scope)) return { member: null, forbidden: true };
	return { member, forbidden: false };
}
