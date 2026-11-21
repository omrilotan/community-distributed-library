import { appBase } from "../../../lib/site.ts";
import { library } from "../../../lib/library.ts";

/**
 * Agentic Resource Discovery (agenticresourcediscovery.org, v0.91): what an
 * agent can use here, for one that looks by this name rather than by the
 * API catalogue (RFC 9727, beside this). Two entries: the MCP server, by
 * its card, and the REST API, by its OpenAPI description. Both need a
 * member to sign in; neither is listed anywhere else.
 *
 * Not served: ai-catalog.json, the name before this one, which the
 * specification says not to serve as well; and an A2A agent card, since
 * the library speaks MCP and REST, not A2A.
 */
export async function GET(): Promise<Response> {
	const site = appBase().replace(/\/$/, "");
	const host = new URL(site).hostname;
	const { name, type } = await library();
	const lends = type === "things" ? "things" : "books";
	const one = type === "things" ? "a drill" : "a novel";

	const manifest = {
		entries: [
			{
				identifier: `urn:air:${host}:mcp`,
				displayName: `${name} MCP server`,
				type: "application/mcp-server-card+json",
				url: `${site}/.well-known/mcp/server-card.json`,
				description: `${name}, a neighbourhood library of ${lends}, for a member's assistant: search what neighbours lend, list the member's own, ask to borrow, answer requests and arrange handovers. The member signs in and chooses what it may do.`,
				capabilities: ["Search", "Lend", "Borrow", "Handover"],
				representativeQueries: [
					`is anyone near me lending ${one}`,
					"what have I lent out and when is it due back",
					"ask to borrow it and suggest a time to collect",
				],
			},
			{
				identifier: `urn:air:${host}:api`,
				displayName: `${name} API`,
				type: "application/vnd.oai.openapi+json",
				url: `${site}/api/v1/openapi.json`,
				description: `Every call ${name}'s website makes, for a member's own scripts. A personal token comes from ${site}/connect.`,
				representativeQueries: [
					"list my loans",
					`search the ${lends} on the shelves`,
				],
			},
		],
	};

	return new Response(JSON.stringify(manifest, null, 2), {
		headers: {
			"content-type": "application/json",
			"access-control-allow-origin": "*",
			"cache-control": "public, max-age=86400",
		},
	});
}
