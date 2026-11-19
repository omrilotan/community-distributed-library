import type { McpServer } from "@modelcontextprotocol/server";
import type { NewsHint } from "@cdl/contracts";
import type { Call } from "@cdl/tools";

/**
 * Nothing wakes an assistant: MCP has no way to tell a member something
 * happened, and the assistant only comes here when the member asks it to.
 * So it hears in passing. Whatever tool it called, the answer ends with how
 * many notices are new for the member, each counted once per connection
 * (core's /v1/me/news/hint), and `whats_new` lists them.
 *
 * Counts only. What a notice says is written by other members; it stays
 * behind a tool the assistant calls on purpose, not at the end of a search.
 */

/** A kind of notice, in the assistant's words: one of them, and several. */
const WORDS: Record<string, [string, string]> = {
	loan_request: ["loan request", "loan requests"],
	loan_decision: ["answer to a loan request", "answers to loan requests"],
	loan_message: ["loan message", "loan messages"],
	loan_nudge: ["nudge about a loan", "nudges about loans"],
	loan_reminder: ["loan reminder", "loan reminders"],
	handoff: ["handover update", "handover updates"],
	waitlist_offer: [
		"item held for them from the waiting list",
		"items held for them from the waiting list",
	],
	wishlist_available: ["wished-for item now free", "wished-for items now free"],
	copy_damage: ["note about damage to their item", "notes about damage"],
	report: ["report for the moderators", "reports for the moderators"],
	report_update: ["update on a report", "updates on reports"],
	librarian_digest: ["overdue summary for moderators", "overdue summaries"],
};

/** The line an answer ends with, or nothing when nothing is new. */
export function newsLine(counts: Record<string, number>): string | null {
	const parts = Object.entries(counts)
		.filter(([, count]) => count > 0)
		.map(([kind, count]) => {
			const [one, many] = WORDS[kind] ?? ["other notice", "other notices"];
			return `${count} ${count === 1 ? one : many}`;
		});
	if (parts.length === 0) return null;
	return `Also new for the member since they last looked: ${parts.join(", ")}. Tell them, and call whats_new for what each one is.`;
}

type Result = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

/**
 * Every tool registered on the server from here on ends its answer with the
 * line above when there is news. Not an answer that failed, and not
 * whats_new itself. Asking never breaks the tool: no line is said instead.
 */
export function mentionNews(server: McpServer, call: Call): McpServer {
	const register = server.registerTool.bind(server);
	server.registerTool = ((
		name: string,
		config: unknown,
		handler: (...args: unknown[]) => Promise<Result>,
	) =>
		(register as (...args: unknown[]) => unknown)(
			name,
			config,
			async (...args: unknown[]) => {
				const result = await handler(...args);
				if (name === "whats_new" || result.isError) return result;
				const line = await call<NewsHint>("/v1/me/news/hint", {
					method: "POST",
				})
					.then(({ status, body }) =>
						status === 200 ? newsLine(body.counts ?? {}) : null,
					)
					.catch(() => null);
				return line
					? {
							...result,
							content: [
								...result.content,
								{ type: "text" as const, text: line },
							],
						}
					: result;
			},
		)) as McpServer["registerTool"];
	return server;
}
