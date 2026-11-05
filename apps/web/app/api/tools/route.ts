import { described, pageTools } from "../../../lib/page-tools.ts";

/**
 * The tools this member's pages offer an agent in the browser (WebMCP), for
 * the page to register. Signed out, there are none: a library is for its
 * members.
 */
export async function GET(): Promise<Response> {
	const tools = await pageTools();
	if (!tools) return Response.json([], { status: 401 });
	return Response.json(tools.map(described), {
		headers: { "cache-control": "private, no-store" },
	});
}
