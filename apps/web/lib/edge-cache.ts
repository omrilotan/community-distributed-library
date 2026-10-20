/**
 * The edge's copy of a page anybody may see. The application says which
 * pages those are (middleware.ts), by a `CDN-Cache-Control` header; the
 * Worker keeps them, since a Worker's own responses never reach the zone's
 * cache by themselves.
 */

/** Stamped at build time (vite.config.ts): a stored page never outlives the build whose scripts it names. */
declare const __BUILD_STAMP__: string;

/** Where the page says how long the edge may keep it, apart from the browser. */
export const CDN_CACHE_CONTROL = "cdn-cache-control";
/** The browser's own Cache-Control, kept on the stored copy while the edge's stands in for it. */
const BROWSER_CACHE_CONTROL = "x-cdl-browser-cache-control";

/**
 * A request a stored page may answer: a plain visit, carrying nothing that
 * could make its page somebody's own — no cookie of any kind — and not one of
 * the router's own requests, which vary by headers the store does not see.
 */
export function shareable(request: Request): boolean {
	if (request.method !== "GET") return false;
	if (request.headers.has("cookie") || request.headers.has("authorization"))
		return false;
	for (const name of request.headers.keys())
		if (
			name === "rsc" ||
			name.startsWith("next-") ||
			name.startsWith("x-vinext")
		)
			return false;
	return !new URL(request.url).searchParams.has("_rsc");
}

/** How long the page lets the edge keep it, in seconds; 0 for not at all. */
export function edgeSeconds(response: Response): number {
	if (response.status !== 200 || response.headers.has("set-cookie")) return 0;
	const match = /(?:^|,)\s*max-age=(\d+)/i.exec(
		response.headers.get(CDN_CACHE_CONTROL) ?? "",
	);
	return match ? Number(match[1]) : 0;
}

/**
 * The application decides what the edge may keep: a page that sends
 * `CDN-Cache-Control: max-age=N` is stored here for N seconds and served to
 * the next visitor with no cookie, while the browser is told what the page
 * told it (no-store). Workers' own responses never reach the zone's cache by
 * themselves, so the Worker keeps them in it.
 */
export function withEdgeCache(app: {
	fetch(
		request: Request,
		env: unknown,
		ctx: ExecutionContext,
	): Promise<Response> | Response;
}) {
	return {
		async fetch(
			request: Request,
			env: unknown,
			ctx: ExecutionContext,
		): Promise<Response> {
			if (!shareable(request)) return app.fetch(request, env, ctx);

			const address = new URL(request.url);
			address.searchParams.set("__build", __BUILD_STAMP__);
			const key = new Request(address.toString(), { method: "GET" });
			const cache = (caches as unknown as { default: Cache }).default;

			const stored = await cache.match(key);
			if (stored) {
				const served = new Response(stored.body, stored);
				served.headers.set(
					"cache-control",
					stored.headers.get(BROWSER_CACHE_CONTROL) ?? "no-store",
				);
				served.headers.delete(BROWSER_CACHE_CONTROL);
				served.headers.set("x-cdl-cache", "hit");
				return served;
			}

			const response = await app.fetch(request, env, ctx);
			const seconds = edgeSeconds(response);
			if (seconds === 0) return response;
			const copy = new Response(response.clone().body, response);
			copy.headers.set(
				BROWSER_CACHE_CONTROL,
				response.headers.get("cache-control") ?? "no-store",
			);
			copy.headers.set("cache-control", `public, max-age=${seconds}`);
			copy.headers.delete(CDN_CACHE_CONTROL);
			// Only plain visits reach the store (shareable), so what the router
			// varies on does not apply to it.
			copy.headers.delete("vary");
			ctx.waitUntil(cache.put(key, copy));
			const served = new Response(response.body, response);
			served.headers.set("x-cdl-cache", "miss");
			return served;
		},
	};
}
