/**
 * No crawler is welcome in a library: it is a neighbourhood's, found by
 * invitation. Only the project's front door, on the bare domain, is public.
 * The pages also say `noindex, nofollow` (middleware.ts), for anything that
 * reaches one through somebody else's link.
 */
const ROBOTS = [
	"User-agent: *",
	// Content Signals (contentsignals.org), for a crawler that reads past the
	// Disallow: nothing here is for search, an AI's answers or training.
	"Content-Signal: search=no, ai-input=no, ai-train=no",
	"Disallow: /",
	"",
].join("\n");

export function GET(): Response {
	return new Response(ROBOTS, {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=86400",
		},
	});
}
