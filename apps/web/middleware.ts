import { env } from "cloudflare:workers";
import { NextResponse, type NextRequest } from "next/server";
import { CDN_CACHE_CONTROL } from "./lib/edge-cache.ts";
import {
	SHOWN_ONCE_COOKIE,
	SHOWN_ONCE_HEADER,
} from "./lib/shown-once-cookie.ts";
import { library } from "./lib/library.ts";

/**
 * One Content-Security-Policy for every page, with a fresh nonce per request:
 * vinext reads the nonce off the request header and stamps it on the scripts
 * it injects, so nothing else on the page may run.
 *
 * Styles keep `unsafe-inline` on purpose. Leaflet writes `style` attributes as
 * it moves the map, and a nonce would not cover those — adding one here would
 * make the browser ignore `unsafe-inline` and break the map.
 */
const development = process.env.NODE_ENV !== "production";

/**
 * Where the tiles and the photos come from; everything else is our own. Each
 * library keeps its photos on its own domain, named in the IMAGES_URL var.
 */
const TILES = "https://tile.openstreetmap.org";
const IMAGES = (env as unknown as { IMAGES_URL?: string }).IMAGES_URL ?? "";

/** Where browsers send CSP and network-error reports; none, if empty. */
const REPORTS = (env as unknown as { REPORTS_URL?: string }).REPORTS_URL ?? "";
const REPORTING_ENDPOINTS = [
	`cdl-csp="${REPORTS}/csp"`,
	`cdl-nel="${REPORTS}/nel"`,
].join(", ");
const NEL = JSON.stringify({
	report_to: "cdl-nel",
	max_age: 2592000,
	success_fraction: 0.0,
	failure_fraction: 1.0,
});
/**
 * Network Error Logging names its group in the older Report-To header only:
 * browsers do not take it from Reporting-Endpoints, so without this every
 * failure report went nowhere.
 */
const REPORT_TO = JSON.stringify({
	group: "cdl-nel",
	max_age: 2592000,
	endpoints: [{ url: `${REPORTS}/nel` }],
});

/**
 * Consent hands the member back to the assistant that sent them, which is a
 * redirect the browser treats as part of the form submission — so `form-action`
 * has to allow it or approval is blocked. Only these two paths, and only https.
 */
// Locally the MCP server is plain http on its own port.
const DEV_MCP =
	process.env.NODE_ENV !== "production" ? " http://localhost:8788" : "";

function offSite(pathname: string): boolean {
	return pathname.startsWith("/oauth/") || pathname.startsWith("/api/oauth/");
}

function policy(nonce: string, pathname: string): string {
	return [
		"default-src 'self'",
		// Our own bundles, plus the nonce for the few inline scripts. No
		// `strict-dynamic`: it would block the modulepreload links the build
		// emits. Vite rewrites modules on the fly in development, which needs eval.
		`script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
		"style-src 'self' 'unsafe-inline'",
		// Photos come off the bucket; in development core serves them as well.
		`img-src 'self' data: blob: ${TILES}${IMAGES ? ` ${IMAGES}` : ""}${development ? " http://localhost:8787" : ""}`,
		"font-src 'self'",
		// Development also talks to the Vite dev server over a websocket.
		`connect-src 'self'${development ? " ws: wss:" : ""}`,
		"manifest-src 'self'",
		"worker-src 'self'",
		"frame-ancestors 'none'",
		`form-action 'self'${offSite(pathname) ? ` https:${DEV_MCP}` : ""}`,
		"base-uri 'self'",
		"object-src 'none'",
		// Where a refusal is reported; the group is named in Reporting-Endpoints.
		...(REPORTS ? ["report-to cdl-csp"] : []),
	].join("; ");
}

/**
 * A change made from another site is refused. SameSite=Lax is not enough here:
 * every community and service shares one registrable domain, so a page on any
 * sibling subdomain counts as "same site" and its forms would carry the
 * member's cookie. Browsers send Origin on every POST; its absence means a
 * client that does not carry cookies anyway. /api/v1 is the bearer-token API
 * and takes no cookie, so it is left to its tokens.
 */
function crossOrigin(request: NextRequest): boolean {
	if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
	const url = new URL(request.url);
	if (url.pathname.startsWith("/api/v1/")) return false;
	const origin = request.headers.get("origin");
	return origin !== null && origin !== url.origin;
}

/**
 * The shelves' filters, remembered per browser: the language, the reader's
 * age, "available now", the order. A cookie rather than local storage, so the
 * page comes back filtered from the server, with nothing redrawn.
 *
 * Coming to the shelves from anywhere else — opening the app, the Browse tab,
 * Back from a book — brings the filters back. Changing them on the shelves,
 * clearing them included, is remembered. A search or a member's shelf leaves
 * them alone.
 */
const FILTERS = [
	"tags",
	"match",
	"sort",
	"availableOnly",
	"showMine",
	"showRead",
	"wished",
	"within",
] as const;
const FILTERS_COOKIE = "browse";
/** Tells the page the filters just changed, so it keeps them on the member. */
export const BROWSE_CHANGED_HEADER = "x-cdl-browse";
/** Tells the layout what the robots header said, so the meta tag agrees. */
export const ROBOTS_HEADER = "x-cdl-robots";

/**
 * No library is for search engines: a neighbourhood's library is found by
 * invitation, and only the project's front door (the bare domain) is public.
 * Every page says so, in a header and in a meta tag.
 */
const ROBOTS = "noindex, nofollow";

/**
 * `?lang=he` (or `en`) in any address: a link that opens in that language,
 * for sharing the library with somebody in theirs. It is kept, like the
 * menu's switch keeps it, so the pages after open the same way.
 */
function languageAsked(url: URL): "he" | "en" | null {
	const lang = url.searchParams.get("lang");
	return lang === "he" || lang === "en" ? lang : null;
}

function rememberLanguage(response: NextResponse, lang: "he" | "en") {
	response.cookies.set("locale", lang, {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: 60 * 60 * 24 * 365,
	});
}

/** The request's cookies with `locale` set: the page reads it this visit already. */
function withLocale(cookie: string | null, lang: string): string {
	const rest = (cookie ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part && !part.startsWith("locale="));
	return [...rest, `locale=${lang}`].join("; ");
}

function filtersOf(params: URLSearchParams): string {
	const kept = new URLSearchParams();
	for (const key of FILTERS) {
		const value = params.get(key);
		if (value) kept.set(key, value.slice(0, 500));
	}
	return kept.toString();
}

/**
 * Came here from the filtered shelves themselves, so a bare "/" means the
 * filters were cleared. A search or a member's shelf is "/" too, but leaving
 * one for the shelves is going back to them, not clearing anything.
 */
function fromTheShelves(request: NextRequest): boolean {
	const referer = request.headers.get("referer");
	if (!referer) return false;
	try {
		const from = new URL(referer);
		return (
			from.origin === new URL(request.url).origin &&
			from.pathname === "/" &&
			!from.searchParams.has("q") &&
			!from.searchParams.has("owner")
		);
	} catch {
		return false;
	}
}

function rememberedFilters(request: NextRequest): {
	redirect?: NextResponse;
	/** The filters as they now are, when this request changed them. */
	changed?: string;
} {
	const url = new URL(request.url);
	if (url.pathname !== "/" || request.method !== "GET") return {};
	// The page's own data requests (a refresh after a form) are not visits.
	if (request.headers.has("rsc") || url.searchParams.has("_rsc")) return {};
	if (url.searchParams.has("q") || url.searchParams.has("owner")) return {};

	// A language in the address says nothing about filters.
	const params = new URLSearchParams(url.searchParams);
	params.delete("lang");
	const saved = filtersOf(
		new URLSearchParams(request.cookies.get(FILTERS_COOKIE)?.value ?? ""),
	);
	if (params.toString() === "" && saved && !fromTheShelves(request)) {
		return { redirect: NextResponse.redirect(new URL(`/?${saved}`, url), 307) };
	}
	const now = filtersOf(params);
	return now === saved ? {} : { changed: now };
}

function rememberFilters(response: NextResponse, filters: string) {
	if (filters) {
		response.cookies.set(FILTERS_COOKIE, filters, {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: !development,
			maxAge: 60 * 60 * 24 * 180,
		});
	} else {
		response.cookies.delete(FILTERS_COOKIE);
	}
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
	// Only on the custom domain, even if workers.dev is ever switched back on:
	// the zone's rules and headers do not reach that address.
	if (new URL(request.url).hostname.endsWith(".workers.dev")) {
		return new NextResponse("Not found", { status: 404 });
	}
	if (crossOrigin(request)) {
		return new NextResponse("Cross-origin request refused", { status: 403 });
	}
	// Only a language the library offers counts, asked for or remembered.
	const info = await library();
	const offered = (value: string | undefined): value is "en" | "he" =>
		info.languages.includes(value as "en" | "he");
	const asked = languageAsked(new URL(request.url));
	const lang = offered(asked ?? undefined) ? asked : null;
	const remembered = rememberedFilters(request);
	if (remembered.redirect) {
		if (lang) rememberLanguage(remembered.redirect, lang);
		return remembered.redirect;
	}

	const nonce = crypto.randomUUID().replaceAll("-", "");
	const csp = policy(nonce, new URL(request.url).pathname);

	const headers = new Headers(request.headers);
	headers.set("content-security-policy", csp);
	if (lang) headers.set("cookie", withLocale(headers.get("cookie"), lang));
	// Nobody chose, or chose a language the library no longer offers: its
	// own language, for this request only, so a change by the admin reaches
	// everyone it concerns.
	else if (!offered(request.cookies.get("locale")?.value))
		headers.set(
			"cookie",
			withLocale(headers.get("cookie"), info.defaultLocale),
		);
	const pathname = new URL(request.url).pathname;
	const robots = ROBOTS;
	headers.set(ROBOTS_HEADER, robots);
	// A change of filters: the page hears, to keep it on the member. Only
	// middleware may say so, as with the secret shown once below.
	headers.delete(BROWSE_CHANGED_HEADER);
	if (remembered.changed !== undefined)
		headers.set(BROWSE_CHANGED_HEADER, remembered.changed);
	// A secret shown once (lib/shown-once.ts): handed to this page view in a
	// header only middleware sets, and the cookie that carried it cleared.
	headers.delete(SHOWN_ONCE_HEADER);
	const shownOnce =
		request.method === "GET"
			? request.cookies.get(SHOWN_ONCE_COOKIE)?.value
			: undefined;
	if (shownOnce) headers.set(SHOWN_ONCE_HEADER, shownOnce);
	const response = NextResponse.next({ request: { headers } });
	if (remembered.changed !== undefined)
		rememberFilters(response, remembered.changed);
	if (lang) rememberLanguage(response, lang);
	if (shownOnce)
		response.cookies.set(SHOWN_ONCE_COOKIE, "", {
			path: "/",
			maxAge: 0,
			httpOnly: true,
			secure: true,
			sameSite: "lax",
		});
	response.headers.set("content-security-policy", csp);
	if (REPORTS) response.headers.set("reporting-endpoints", REPORTING_ENDPOINTS);
	// Only the front door and the story of the library are for any index; a
	// small community's shelves are found by invitation.
	response.headers.set("x-robots-tag", robots);
	// Not for search engines, but an agent sent by a member should find its
	// way in: RFC 9727 names where the APIs are described.
	response.headers.set(
		"link",
		'</.well-known/api-catalog>; rel="api-catalog", </llms.txt>; rel="describedby"; type="text/markdown"',
	);
	// Network errors: every failure, none of the successes.
	if (REPORTS) {
		response.headers.set("nel", NEL);
		response.headers.set("report-to", REPORT_TO);
	}
	// The rest of the usual hardening. HSTS is set at the zone.
	response.headers.set("x-content-type-options", "nosniff");
	response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
	response.headers.set("permissions-policy", PERMISSIONS);
	response.headers.set("cross-origin-opener-policy", "same-origin");
	// The shelves as a stranger sees them are the same for every stranger:
	// the edge may keep them an hour (lib/edge-cache.ts). Only for a visit
	// with no cookie at all, so a returning visitor, signed in or not,
	// always gets a page made for them. The browser keeps nothing. Not in
	// development, where the tests change the shelves between visits.
	if (
		!development &&
		request.method === "GET" &&
		pathname === "/" &&
		!request.headers.has("cookie") &&
		!lang &&
		remembered.changed === undefined
	)
		response.headers.set(CDN_CACHE_CONTROL, `max-age=${EDGE_SECONDS}`);
	return response;
}

/** How long the edge keeps the public shelves. */
const EDGE_SECONDS = 60 * 60;

/**
 * What the page may ask the browser for. Only what it uses is allowed, and
 * only for itself: location for the map, copying a link. Everything else is
 * off, here and in anything it could ever embed. The share sheet is left
 * out: Chrome does not know it as a feature and warns on every page, and it
 * is the page's own by default. So is picture-in-picture: Chrome probes
 * for it on every load and logs a violation, and the pages have no video.
 * Notifications are not a policy feature; the
 * member grants those.
 */
const PERMISSIONS = [
	"geolocation=(self)",
	"clipboard-write=(self)",
	...[
		"accelerometer",
		"autoplay",
		"bluetooth",
		"browsing-topics",
		"camera",
		"clipboard-read",
		"display-capture",
		"encrypted-media",
		"fullscreen",
		"gamepad",
		"gyroscope",
		"hid",
		"identity-credentials-get",
		"idle-detection",
		"local-fonts",
		"magnetometer",
		"microphone",
		"midi",
		"otp-credentials",
		"payment",
		"publickey-credentials-create",
		"publickey-credentials-get",
		"screen-wake-lock",
		"serial",
		"storage-access",
		"usb",
		"window-management",
		"xr-spatial-tracking",
	].map((feature) => `${feature}=()`),
].join(", ");

export const config = {
	// Pages and route handlers. Built assets are served straight off the bucket
	// and carry no markup to protect.
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
