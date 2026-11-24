/**
 * The page for an address the app has no route for, rendered once per
 * isolate and language and then answered from memory.
 *
 * Scanners ask for hundreds of such addresses a second (/.env, /backup.zip).
 * Rendering each one ran the whole layout, which asks core for the library,
 * and a scanner that hangs up mid-render left an uncaught "Network connection
 * lost." that raised a failure alert. An address whose first segment is no
 * route is now answered here, without rendering and without core.
 *
 * Kept in the isolate, not the edge's cache: the page is the same for
 * everyone, and nothing outside the Worker has to be asked for it.
 */

import { locales, type Locale } from "./i18n.ts";

type Handler = {
	fetch(
		request: Request,
		env: unknown,
		ctx: ExecutionContext,
	): Promise<Response> | Response;
};

/** An address no route answers, rendered to get the app's own 404 page. */
export const NOT_FOUND_PATH = "/__not-found";

/** How long a rendered page is kept: the library's name or colour may change. */
const TTL_MS = 10 * 60_000;

/**
 * Whether the app may have a route for this address. `routes` are the
 * directories under app/. A segment the list cannot rule out — the root, the
 * framework's own `_` paths, or any address at all when app/ has a dynamic or
 * grouped segment at its top — goes to the app as before.
 */
export function routed(pathname: string, routes: readonly string[]): boolean {
	if (routes.some((name) => /^[[(]/.test(name))) return true;
	const first = pathname.split("/")[1] ?? "";
	if (first === "" || first.startsWith("_")) return true;
	let segment: string;
	try {
		segment = decodeURIComponent(first);
	} catch {
		return false;
	}
	return routes.includes(segment);
}

/** The visitor's language, from the cookie the app sets; English otherwise. */
export function localeOf(request: Request): Locale {
	const match = /(?:^|;\s*)locale=([^;]*)/.exec(
		request.headers.get("cookie") ?? "",
	);
	const value = match?.[1] as Locale | undefined;
	return value && locales.includes(value) ? value : "en";
}

interface Stored {
	headers: [string, string][];
	body: string;
	until: number;
}

/** The plain page when the app's own could not be rendered. */
const PLAIN = "Not found";

export function withNotFoundPage(
	app: Handler,
	routes: readonly string[],
	now: () => number = Date.now,
) {
	const pages = new Map<Locale, Promise<Stored | null>>();

	async function render(
		origin: string,
		locale: Locale,
		env: unknown,
		ctx: ExecutionContext,
	): Promise<Stored | null> {
		try {
			// A visitor with no session: the page holds nobody's own details.
			const response = await app.fetch(
				new Request(`${origin}${NOT_FOUND_PATH}`, {
					headers: { accept: "text/html", cookie: `locale=${locale}` },
				}),
				env,
				ctx,
			);
			const html = response.headers
				.get("content-type")
				?.startsWith("text/html");
			if (response.status !== 404 || !html) {
				await response.body?.cancel();
				return null;
			}
			const headers = [...response.headers].filter(
				([name]) => name !== "set-cookie" && name !== "content-length",
			);
			return { headers, body: await response.text(), until: now() + TTL_MS };
		} catch {
			return null;
		}
	}

	async function page(
		origin: string,
		locale: Locale,
		env: unknown,
		ctx: ExecutionContext,
	): Promise<Stored | null> {
		const kept = pages.get(locale);
		if (kept) {
			const stored = await kept;
			if (stored && stored.until > now()) return stored;
			// Another request may have started a fresh render meanwhile.
			if (pages.get(locale) !== kept) return page(origin, locale, env, ctx);
		}
		// One render at a time per language, however many requests are waiting.
		const rendering = render(origin, locale, env, ctx);
		pages.set(locale, rendering);
		const stored = await rendering;
		// A failed render is not kept: the next request tries again.
		if (!stored && pages.get(locale) === rendering) pages.delete(locale);
		return stored;
	}

	return {
		async fetch(
			request: Request,
			env: unknown,
			ctx: ExecutionContext,
		): Promise<Response> {
			const url = new URL(request.url);
			if (
				!["GET", "HEAD"].includes(request.method) ||
				routed(url.pathname, routes)
			)
				return app.fetch(request, env, ctx);

			const stored = await page(url.origin, localeOf(request), env, ctx);
			const body = request.method === "HEAD" ? null : (stored?.body ?? PLAIN);
			if (!stored)
				return new Response(body, {
					status: 404,
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"cache-control": "no-store",
					},
				});
			const headers = new Headers(stored.headers);
			headers.set("x-cdl-cache", "memory");
			return new Response(body, { status: 404, headers });
		},
	};
}
