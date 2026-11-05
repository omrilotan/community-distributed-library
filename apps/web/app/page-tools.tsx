"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface Described {
	name: string;
	description: string;
	inputSchema: object;
	annotations: { readOnlyHint: boolean };
}

interface ModelContext {
	registerTool(
		tool: Described & {
			execute(input: unknown, use?: { signal?: AbortSignal }): Promise<string>;
		},
		options?: { signal?: AbortSignal },
	): unknown;
}

/**
 * Offers an agent in the browser what the library's MCP server offers an
 * assistant: the same tools, through WebMCP, where the browser has it
 * (`document.modelContext`, earlier `navigator.modelContext`). Elsewhere it
 * does nothing and asks for nothing.
 *
 * The list comes from /api/tools, for this member; each call goes back
 * there and runs as them. After a call that changed something the page is
 * drawn again, so what the agent did is what the member sees.
 */
export function PageTools() {
	const router = useRouter();
	useEffect(() => {
		const context = ((document as { modelContext?: ModelContext })
			.modelContext ??
			(navigator as { modelContext?: ModelContext }).modelContext) as
			ModelContext | undefined;
		if (!context?.registerTool) return;
		const controller = new AbortController();
		const { signal } = controller;
		void (async () => {
			const response = await fetch("/api/tools", { signal });
			if (!response.ok) return;
			for (const tool of (await response.json()) as Described[]) {
				try {
					await context.registerTool(
						{
							...tool,
							async execute(input, use) {
								// Before Chrome 155 the input could come as JSON text.
								const body =
									typeof input === "string"
										? input
										: JSON.stringify(input ?? {});
								const reply = await fetch(
									`/api/tools/${encodeURIComponent(tool.name)}`,
									{
										method: "POST",
										headers: { "content-type": "application/json" },
										body,
										...(use?.signal ? { signal: use.signal } : {}),
									},
								);
								const text = await reply.text();
								if (!reply.ok) return `Error ${reply.status}: ${text}`;
								if (!tool.annotations.readOnlyHint) router.refresh();
								return text;
							},
						},
						{ signal },
					);
				} catch {
					// Already offered (a page drawn twice) or refused: the rest still go.
				}
			}
		})().catch(() => {
			// Signed out meanwhile, or the page left: nothing to offer.
		});
		return () => controller.abort();
	}, [router]);
	return null;
}
