import type { MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";
import type { Env } from "./env.ts";

/**
 * The cdl_events dataset (docs/observability-plan.md, 1.5 and 1.6): the
 * counts the dashboards and the ops tools read. One dataset for every
 * library, told apart by index1. Written only, never read on a request.
 *
 *   index1  library slug
 *   blob1   kind: request | domain | check | job | snapshot
 *   blob2   name: the route as declared (GET /v1/loans/:id), the event
 *           (loan.requested), the check, the job, the snapshot metric
 *   blob3   outcome: 2xx 4xx 5xx | ok failed
 *   blob4   surface: web | api | mcp | webmcp | cron
 *   double1 1, one point
 *   double2 duration, ms
 *   double3 value (a check's count, a snapshot's number)
 *   double4 weight, 1 / the share kept: every count is SUM(double4)
 *
 * Ids, addresses and search terms never go in: a request is named by its
 * route, never its URL.
 */
export type Kind = "request" | "domain" | "check" | "job" | "snapshot";
export type Surface = "web" | "api" | "mcp" | "webmcp" | "cron";

const SURFACES = new Set(["web", "api", "mcp", "webmcp"]);

export interface Point {
	kind: Kind;
	name: string;
	outcome: string;
	surface: Surface;
	ms?: number;
	value?: number;
	weight?: number;
}

export function record(env: Env, point: Point): void {
	if (!env.EVENTS) return;
	try {
		env.EVENTS.writeDataPoint({
			indexes: [env.LIBRARY || "local"],
			blobs: [point.kind, point.name, point.outcome, point.surface],
			doubles: [1, point.ms ?? 0, point.value ?? 0, point.weight ?? 1],
		});
	} catch {
		// Counting is never the work: a full buffer loses a point, not a request.
	}
}

/** Wall time over which a request is slow, and so always kept. */
const SLOW_MS = 1000;
const SLOW_SEARCH_MS = 1500;

/** Requests rare enough, and important enough, to keep every one. */
const ALWAYS = /^\/v1\/(auth|tokens|oauth|invites|consent|join)/;

/**
 * The share of ordinary reads kept: READS_SAMPLE_RATE, or all of them in
 * the hour after a deploy and while SAMPLING_BOOST_UNTIL lasts.
 */
export function readRate(env: Env, at = Date.now()): number {
	const deployed = Number(env.DEPLOYED_AT || 0);
	const boost = Date.parse(env.SAMPLING_BOOST_UNTIL || "");
	if (deployed && at - deployed < 3600_000) return 1;
	if (!Number.isNaN(boost) && at < boost) return 1;
	const rate = Number(env.READS_SAMPLE_RATE || 1);
	return rate > 0 && rate <= 1 ? rate : 1;
}

/**
 * Whether a request falls in the kept share, by its id: one visitor
 * request's points (web, then core) are kept or dropped together.
 */
export function kept(id: string, rate: number): boolean {
	if (rate >= 1) return true;
	let hash = 2166136261;
	for (let at = 0; at < id.length; at += 1) {
		hash ^= id.charCodeAt(at);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 2 ** 32 < rate;
}

/**
 * Counts every request core answers. Always kept, weight 1: errors, slow
 * requests, writes, sign-in and connecting, and the assistants' calls.
 * Fast successful reads are kept at the read rate, each with its weight.
 */
export function requests(): MiddlewareHandler<{ Bindings: Env }> {
	return async (c, next) => {
		const started = Date.now();
		await next();
		const ms = Date.now() - started;
		const status = c.res.status;
		const path = new URL(c.req.url).pathname;
		const route =
			matchedRoutes(c)
				.filter((one) => one.method !== "ALL")
				.at(-1)?.path ?? "unmatched";
		const said = c.req.header("x-cdl-surface") ?? "";
		const surface = (SURFACES.has(said) ? said : "api") as Surface;
		const method = c.req.method;
		const slow = ms > (route.endsWith("/search") ? SLOW_SEARCH_MS : SLOW_MS);
		const always =
			status >= 500 ||
			slow ||
			(method !== "GET" && method !== "HEAD") ||
			surface === "mcp" ||
			ALWAYS.test(path);
		const rate = always ? 1 : readRate(c.env);
		const id =
			c.req.header("x-cdl-request") ??
			c.req.header("cf-ray") ??
			crypto.randomUUID();
		if (!kept(id, rate)) return;
		record(c.env, {
			kind: "request",
			name: `${method} ${route}`,
			outcome: `${Math.floor(status / 100)}xx`,
			surface,
			ms,
			weight: 1 / rate,
		});
	};
}

/**
 * The day's numbers about the library as a community, counted exactly from
 * the database, never from sampled points: distinct counts cannot be rebuilt
 * from a sample. Counts only.
 */
export async function snapshot(env: Env, at = Math.floor(Date.now() / 1000)) {
	const DAY = 86_400;
	const one = async (sql: string, ...values: unknown[]) =>
		(
			await env.DB.prepare(sql)
				.bind(...values)
				.first<{ n: number }>()
		)?.n ?? 0;
	const numbers: Record<string, number> = {
		members: await one(
			"SELECT COUNT(*) AS n FROM memberships WHERE status = 'active'",
		),
		members_active_7d: await one(
			"SELECT COUNT(*) AS n FROM members WHERE last_seen_at > ? AND deactivated_at IS NULL",
			at - 7 * DAY,
		),
		members_active_30d: await one(
			"SELECT COUNT(*) AS n FROM members WHERE last_seen_at > ? AND deactivated_at IS NULL",
			at - 30 * DAY,
		),
		items: await one(
			"SELECT COUNT(*) AS n FROM copies WHERE state NOT IN ('retired', 'lost')",
		),
		items_lendable: await one(
			"SELECT COUNT(*) AS n FROM copies WHERE lending = 'lendable' AND state NOT IN ('retired', 'lost')",
		),
		items_on_loan: await one(
			"SELECT COUNT(*) AS n FROM loans WHERE status = 'active'",
		),
		loans_overdue: await one(
			"SELECT COUNT(*) AS n FROM loans WHERE status = 'active' AND due_at < ?",
			at,
		),
		requests_7d: await one(
			"SELECT COUNT(*) AS n FROM loans WHERE requested_at > ?",
			at - 7 * DAY,
		),
		requests_agreed_7d: await one(
			"SELECT COUNT(*) AS n FROM loans WHERE requested_at > ? AND decided_at IS NOT NULL AND status NOT IN ('declined', 'cancelled')",
			at - 7 * DAY,
		),
		// Seconds an owner took to answer, as the median of the week's.
		answer_median_s: await one(
			`SELECT COALESCE((SELECT decided_at - requested_at FROM loans
			   WHERE requested_at > ? AND decided_at IS NOT NULL
			   ORDER BY decided_at - requested_at
			   LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM loans
			                    WHERE requested_at > ? AND decided_at IS NOT NULL)), 0) AS n`,
			at - 7 * DAY,
			at - 7 * DAY,
		),
		invites_7d: await one(
			"SELECT COUNT(*) AS n FROM invites WHERE created_at > ?",
			at - 7 * DAY,
		),
		asks_7d: await one(
			"SELECT COUNT(*) AS n FROM asks WHERE created_at > ?",
			at - 7 * DAY,
		),
		asks_taken_7d: await one(
			"SELECT COUNT(*) AS n FROM asks WHERE created_at > ? AND status = 'taken'",
			at - 7 * DAY,
		),
	};
	for (const [name, value] of Object.entries(numbers))
		record(env, {
			kind: "snapshot",
			name,
			outcome: "ok",
			surface: "cron",
			value,
		});
	return numbers;
}
