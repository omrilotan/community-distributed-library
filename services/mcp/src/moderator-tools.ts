import type { McpServer } from "@modelcontextprotocol/server";
import { moderatorTools, type Call, type Tool, type Upload } from "@cdl/tools";
import type { Props } from "./env.ts";

type Result = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

interface Use {
	call: Call;
	upload: Upload;
	run: <T>(promise: Promise<{ status: number; body: T }>) => Promise<Result>;
	fail: (status: number, body: unknown) => Result;
}

/** One tool of @cdl/tools, offered over MCP: its reply becomes the result. */
export function offer(
	server: McpServer,
	tool: Tool,
	{ call, upload, run, fail }: Use,
): void {
	server.registerTool(
		tool.name,
		{ description: tool.description, inputSchema: tool.input },
		async (input: Parameters<Tool["run"]>[0]) => {
			const reply = await tool.run(input, { call, upload });
			return reply.failed || reply.status >= 400
				? fail(reply.status, reply.body)
				: run(Promise.resolve(reply));
		},
	);
}

/**
 * What a moderator can do on the website, for their assistant: correct any
 * book and its cover, and keep the tag vocabulary. Registered only for a
 * grant that carries the admin scope, which the consent screen offers to
 * moderators alone, so a member's assistant never sees these tools. Core
 * checks the moderator role on every call regardless.
 */
export function registerModeratorTools(
	server: McpServer,
	props: Props,
	{
		things = false,
		...use
	}: Use & {
		/** A library of things: the same tools, described in its words. */
		things?: boolean;
	},
): void {
	if (!props.scopes.includes("admin")) return;
	for (const tool of moderatorTools(things ? "things" : "books"))
		offer(server, tool, use);
}
