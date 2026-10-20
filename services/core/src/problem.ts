import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { problem, type Problem } from "@cdl/contracts";
import type { Env } from "./env.ts";

/** RFC 9457: problem documents carry their own media type. */
export function json<E extends { Bindings: Env }>(
	c: Context<E>,
	body: Problem,
) {
	return c.json(body, body.status as ContentfulStatusCode, {
		"content-type": "application/problem+json",
	});
}

/**
 * 429 with the wait attached, in the header for machines and in `retryAfter`
 * for the app, so the page can say "try again in four minutes" rather than
 * leaving somebody guessing.
 */
export function tooMany<E extends { Bindings: Env }>(
	c: Context<E>,
	title: string,
	detail: string,
	retryAfter: number,
) {
	return c.json({ ...problem(429, title, detail), retryAfter }, 429, {
		"content-type": "application/problem+json",
		"retry-after": String(retryAfter),
	});
}

/** After viewerWith(): 401 for strangers, 403 for a token that lacks the scope. */
export function denied<E extends { Bindings: Env }>(
	c: Context<E>,
	forbidden: boolean,
) {
	return forbidden
		? json(c, { type: "about:blank", title: "Scope missing", status: 403 })
		: json(c, { type: "about:blank", title: "Not signed in", status: 401 });
}
