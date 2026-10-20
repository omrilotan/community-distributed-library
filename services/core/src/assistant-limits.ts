import type { Context, Next } from "hono";
import type { Env } from "./env.ts";
import { viewer } from "./auth.ts";
import { take } from "./rate-limit.ts";
import { tooMany } from "./problem.ts";

/**
 * What an assistant may do to other people, and how often. A member on the
 * site is not limited here; an assistant acting for them is, because text it
 * reads — a title, a note, a message — could be written to steer it, and a
 * steered assistant should not be able to fill a neighbour's inbox.
 */
const LIMITS: {
	pattern: RegExp;
	bucket: string;
	allow: number;
	per: number;
}[] = [
	{ pattern: /^\/v1\/loans$/, bucket: "request", allow: 10, per: 3600 },
	{
		pattern: /^\/v1\/loans\/[^/]+\/messages$/,
		bucket: "message",
		allow: 20,
		per: 3600,
	},
	{
		pattern: /^\/v1\/reports\/[^/]+\/replies$/,
		bucket: "message",
		allow: 20,
		per: 3600,
	},
	{
		pattern: /^\/v1\/loans\/[^/]+\/(accept|decline|cancel|extend)$/,
		bucket: "decide",
		allow: 20,
		per: 3600,
	},
	{
		pattern: /^\/v1\/loans\/[^/]+\/nudge$/,
		bucket: "nudge",
		allow: 5,
		per: 86400,
	},
	{
		pattern: /^\/v1\/loans\/[^/]+\/report$/,
		bucket: "report",
		allow: 3,
		per: 86400,
	},
	{
		// Proposing or agreeing a time emails the other side.
		pattern: /^\/v1\/loans\/[^/]+\/handoff\/(propose|confirm)$/,
		bucket: "decide",
		allow: 20,
		per: 3600,
	},
	{ pattern: /^\/v1\/contact$/, bucket: "contact", allow: 3, per: 86400 },
	{ pattern: /^\/v1\/invites$/, bucket: "invite", allow: 5, per: 86400 },
	{
		pattern: /^\/v1\/tags\/proposals$/,
		bucket: "suggest",
		allow: 10,
		per: 86400,
	},
];

export async function assistantLimits(
	c: Context<{ Bindings: Env }>,
	next: Next,
) {
	if (c.req.method !== "POST") return next();
	const path = new URL(c.req.url).pathname;
	const limit = LIMITS.find((entry) => entry.pattern.test(path));
	if (!limit) return next();
	const member = await viewer(c);
	// Signed in on the site, or not signed in at all: the route decides.
	if (!member || member.session) return next();
	const verdict = await take(c.env, {
		bucket: `assistant:${limit.bucket}`,
		subject: member.id,
		allow: limit.allow,
		per: limit.per,
	});
	if (!verdict.ok) {
		return tooMany(
			c,
			"Too many from an assistant",
			`An assistant may do this ${limit.allow} times ${limit.per === 3600 ? "an hour" : "a day"} for a member. It can still be done on the site.`,
			verdict.retryAfter,
		);
	}
	return next();
}
