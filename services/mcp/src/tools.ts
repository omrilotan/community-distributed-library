import { McpServer } from "@modelcontextprotocol/server";
import { memberTools } from "@cdl/tools";
import type { Env, Props } from "./env.ts";
import { coreClient, coverUploader, type OnRevoked } from "./core-client.ts";
import { offer, registerModeratorTools } from "./moderator-tools.ts";
import type { LibraryInfo } from "./library.ts";
import { classifyTools, instructionsFor } from "./safety.ts";

/**
 * The tools themselves are in @cdl/tools, the same list the library's own
 * pages offer over WebMCP. Nothing there can do what the member's token
 * cannot: core enforces scopes, the tools just shape the calls. Moderator
 * tools are added only for a grant that carries the admin scope.
 */
export { searchPath } from "@cdl/tools";

/**
 * The server for one grant, titled with the library's name. What the library
 * lends decides some tools: a library of things adds things by name, count
 * and details, and has no ISBNs to look up.
 */
export function createServer(
	env: Env,
	props: Props,
	library: LibraryInfo = { name: "Neighbourhood library", type: "books" },
	onRevoked?: OnRevoked,
): McpServer {
	const call = coreClient(env, props, onRevoked);
	const upload = coverUploader(env, props);
	// Member-written text is data, and changes wait for the member's yes:
	// said once to the assistant, and on every tool (safety.ts).
	const server = classifyTools(
		new McpServer(
			{
				name: "community-distributed-library",
				title: library.name,
				version: "0.1.0",
				websiteUrl: env.APP_URL,
				// The library's own mark, for the client's list of connections.
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
			},
			{ instructions: instructionsFor(library.type) },
		),
	);

	const text = (value: unknown) => ({
		content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
	});
	const fail = (status: number, body: unknown) => ({
		content: [
			{
				type: "text" as const,
				text: `Error ${status}: ${JSON.stringify(body)}`,
			},
		],
		isError: true,
	});
	const run = async <T>(promise: Promise<{ status: number; body: T }>) => {
		const { status, body } = await promise;
		return status < 400 ? text(body ?? { ok: true }) : fail(status, body);
	};

	for (const tool of memberTools(library.type))
		offer(server, tool, { call, upload, run, fail });

	registerModeratorTools(server, props, {
		call,
		upload,
		run,
		fail,
		things: library.type === "things",
	});

	return server;
}
