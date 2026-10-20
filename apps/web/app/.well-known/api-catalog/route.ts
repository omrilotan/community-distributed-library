import { appBase, mcpBase } from "../../../lib/site.ts";

/**
 * RFC 9727: where a machine finds this site's APIs without reading its pages.
 * A linkset naming the REST API's OpenAPI description and the MCP endpoint;
 * every page points here with `Link: …; rel="api-catalog"` (middleware.ts).
 */
export function GET(): Response {
	const site = appBase().replace(/\/$/, "");
	const mcpOrigin = mcpBase();

	const catalog = {
		linkset: [
			{
				anchor: `${site}/.well-known/api-catalog`,
				item: [{ href: `${site}/api/v1` }, { href: `${mcpOrigin}/mcp` }],
			},
			{
				anchor: `${site}/api/v1`,
				"service-desc": [
					{
						href: `${site}/api/v1/openapi.json`,
						type: "application/vnd.oai.openapi+json;version=3.1",
					},
				],
				"service-doc": [{ href: `${site}/connect`, type: "text/html" }],
			},
			{
				anchor: `${mcpOrigin}/mcp`,
				// The MCP server describes its own authorisation (RFC 9728).
				"service-meta": [
					{
						href: `${mcpOrigin}/.well-known/oauth-protected-resource`,
						type: "application/json",
					},
				],
				"service-doc": [{ href: `${site}/llms.txt`, type: "text/markdown" }],
			},
		],
	};

	return new Response(JSON.stringify(catalog, null, 2), {
		headers: {
			"content-type":
				'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
			"cache-control": "public, max-age=86400",
		},
	});
}
