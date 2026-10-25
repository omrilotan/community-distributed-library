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
