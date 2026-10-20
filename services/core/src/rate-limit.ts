import type { Env } from "./env.ts";
import { now } from "./ids.ts";

export interface Limit {
	/** What is being limited; names the counter. */
	bucket: string;
	/** Who or what is counted: an email address, an IP. */
	subject: string;
	/** Calls allowed inside one window. */
	allow: number;
	/** Window length in seconds. */
	per: number;
}

export interface Verdict {
	ok: boolean;
	/** Seconds until the window resets. Zero when allowed. */
	retryAfter: number;
	remaining: number;
}

/**
 * A fixed window per (bucket, subject), counted in D1. Fixed windows let a
 * caller spend two windows' worth across a boundary; that is fine here, where
 * the point is to stop somebody filling a neighbour's inbox, and the limits
 * are told to the caller rather than hidden.
 */
export async function take(env: Env, limit: Limit): Promise<Verdict> {
	const at = now();
	const row = await env.DB.prepare(
		`INSERT INTO rate_limits (bucket, subject, window_end, count)
		 VALUES (?1, ?2, ?3, 1)
		 ON CONFLICT (bucket, subject) DO UPDATE SET
		   count = CASE WHEN rate_limits.window_end <= ?4 THEN 1 ELSE rate_limits.count + 1 END,
		   window_end = CASE WHEN rate_limits.window_end <= ?4 THEN ?3 ELSE rate_limits.window_end END
		 RETURNING count, window_end`,
	)
		.bind(limit.bucket, limit.subject, at + limit.per, at)
		.first<{ count: number; window_end: number }>();

	const count = row?.count ?? 1;
	const windowEnd = row?.window_end ?? at + limit.per;
	return {
		ok: count <= limit.allow,
		retryAfter: Math.max(1, windowEnd - at),
		remaining: Math.max(0, limit.allow - count),
	};
}

/**
 * The visitor's address. Core is reached only over service bindings, where
 * the request is the web worker's, not the visitor's; the web worker passes
 * the address Cloudflare saw under its own header. Absent locally.
 */
export function callerIp(request: Request): string {
	return network(
		request.headers.get("x-cdl-client-ip") ??
			request.headers.get("cf-connecting-ip") ??
			"unknown",
	);
}

/**
 * One caller, for counting: an IPv4 address as it is, an IPv6 address as its
 * /64, which a single home or phone is usually handed whole. Counting full
 * IPv6 addresses gave one household endless fresh allowances.
 */
export function network(ip: string): string {
	if (!ip.includes(":")) return ip;
	// An IPv4 address written as IPv6 (::ffff:192.0.2.1) is that IPv4 address.
	if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1);
	const [head = "", tail] = ip.toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const groups =
		tail === undefined
			? left
			: [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
	return `${groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ""))
		.join(":")}::/64`;
}

/** Housekeeping for the daily pass: spent windows are of no further use. */
export async function pruneRateLimits(env: Env): Promise<number> {
	const result = await env.DB.prepare(
		"DELETE FROM rate_limits WHERE window_end <= ?",
	)
		.bind(now())
		.run();
	return result.meta.changes ?? 0;
}
