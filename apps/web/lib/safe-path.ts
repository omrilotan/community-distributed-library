/**
 * A place to send somebody back to, taken from a form field, a query string or
 * a header: only ever a path on this site. Browsers read "//evil.example",
 * "/\evil.example" and "/\tevil.example" as other hosts, so the check is done
 * the way a browser would resolve it, not by looking at the first characters.
 */
export function safePath(input: unknown, fallback = "/"): string {
	if (typeof input !== "string" || !input.startsWith("/")) return fallback;
	const base = "https://here.invalid";
	try {
		const url = new URL(input, base);
		if (url.origin !== base) return fallback;
		// Resolving can still leave "//evil.example" as the path ("/.//evil.example"
		// does), which a browser reads as another host once it is a Location.
		const path = `${url.pathname}${url.search}${url.hash}`;
		return /^\/(?![/\\])/.test(path) ? path : fallback;
	} catch {
		return fallback;
	}
}

/**
 * A place to come back to after signing in, or null. Only an assistant's
 * consent screen for now: a link to /login with any other `back` must not be
 * able to land a fresh session on a page that does something when opened.
 */
export function backAfterSignIn(input: unknown): string | null {
	const path = safePath(input, "");
	// The request id is the MCP server's crypto.randomUUID() (services/mcp/src/consent.ts).
	return /^\/oauth\/consent\?req=[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(
		path,
	)
		? path
		: null;
}
