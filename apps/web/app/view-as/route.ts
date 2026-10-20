import { VIEW_COOKIE } from "../../lib/view-as.ts";
import { safePath } from "../../lib/safe-path.ts";

/**
 * Switch between the moderator's view and a member's. A GET, because it is a
 * link in the menu and changes nothing but what this browser is shown.
 */
export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const asMember = url.searchParams.get("as") === "member";
	// The banner is rendered on the server, which does not know the path it is
	// on, so fall back to where the click came from.
	const back = url.searchParams.get("back") ?? sameOrigin(request, url);
	// Only our own paths: neither a parameter nor a header is a place to trust.
	const here = safePath(back);
	// Stepping down on a moderator page would land on a page that refuses.
	const location = asMember && here.startsWith("/admin") ? "/" : here;

	return new Response(null, {
		status: 303,
		headers: {
			location,
			"set-cookie": asMember
				? `${VIEW_COOKIE}=member; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`
				: `${VIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
		},
	});
}

/** The referring path, when the referrer is this site. Otherwise the front page. */
function sameOrigin(request: Request, url: URL): string {
	const referer = request.headers.get("referer");
	if (!referer) return "/";
	try {
		const from = new URL(referer);
		return from.origin === url.origin ? `${from.pathname}${from.search}` : "/";
	} catch {
		return "/";
	}
}
