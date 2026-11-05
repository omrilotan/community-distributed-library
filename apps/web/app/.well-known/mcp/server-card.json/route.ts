import { env } from "cloudflare:workers";

/**
 * The library's MCP Server Card, for an agent that looks on the library's
 * own host: the MCP server writes it (services/mcp/src/card.ts) and hands
 * it over the binding, so there is one card for both hosts.
 */
export async function GET(): Promise<Response> {
	const mcp = (env as unknown as { MCP: Fetcher }).MCP;
	const card = await mcp
		.fetch("https://mcp/.well-known/mcp/server-card.json")
		.catch(() => null);
	if (!card?.ok) return new Response("Not found", { status: 404 });
	return new Response(card.body, {
		headers: {
			"content-type": "application/json",
			"access-control-allow-origin": "*",
			"cache-control": "public, max-age=3600",
		},
	});
}
