import type { Env } from "./env.ts";
import type { LibraryInfo } from "./library.ts";

/** The software, as the server names itself to a client that connects. */
export const SERVER = {
	name: "community-distributed-library",
	version: "0.1.0",
} as const;

/** Who this server is: the library's name and mark, for a client's list of connections. */
export function serverIdentity(
	env: Pick<Env, "APP_URL">,
	library: LibraryInfo,
) {
	return {
		...SERVER,
		title: library.name,
		websiteUrl: env.APP_URL,
		// The library's own mark.
		icons: [
			{
				src: `${env.APP_URL}/icon-512.png`,
				mimeType: "image/png",
				sizes: ["512x512"],
			},
			{
				src: `${env.APP_URL}/icon.svg`,
				mimeType: "image/svg+xml",
				sizes: ["any"],
			},
		],
	};
}

/**
 * The MCP Server Card: what an agent can know about this server before it
 * connects. Served at /.well-known/mcp/server-card.json here and on the
 * library's own host, which asks for it over its binding.
 *
 * The format is still settling, so the card says it both ways: the fields of
 * the accepted proposal (SEP-2127: name, remotes, as the registry's
 * server.json has them), and those of the draft before it (SEP-1649:
 * serverInfo, transport), which scanners still read. The tools are left out:
 * which ones a member gets depends on their role, and the server lists them
 * once connected.
 */
export function serverCard(
	env: Pick<Env, "APP_URL" | "SELF_URL">,
	library: LibraryInfo,
) {
	const identity = serverIdentity(env, library);
	const endpoint = `${env.SELF_URL}/mcp`;
	const lends = library.type === "things" ? "things" : "books";
	const description = `${library.name}, a neighbourhood lending library of ${lends}. For a signed-in member: search the catalogue, list what they lend, request a loan, answer requests and arrange handovers.`;
	return {
		name: registryName(env.APP_URL),
		title: identity.title,
		description,
		version: identity.version,
		websiteUrl: identity.websiteUrl,
		icons: identity.icons,
		remotes: [{ type: "streamable-http", url: endpoint }],
		serverInfo: {
			name: identity.name,
			title: identity.title,
			version: identity.version,
		},
		transport: { type: "streamable-http", endpoint },
		capabilities: { tools: {} },
		authentication: { required: true, schemes: ["oauth2"] },
		documentationUrl: `${env.APP_URL}/llms.txt`,
	};
}

/**
 * A registry name, reverse-DNS as server.json wants it: the library's host
 * read backwards, its first label after the slash.
 * finchley.community-distributed-library.com is
 * com.community-distributed-library/finchley.
 */
function registryName(appUrl: string): string {
	const host = new URL(appUrl).hostname;
	const [first, ...rest] = host.split(".");
	return rest.length
		? `${rest.reverse().join(".")}/${first}`
		: `${host}/library`;
}
