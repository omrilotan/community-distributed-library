import type { z } from "zod";

/** Core's public API, as the member: the only way a tool reaches anything. */
export type Call = <T>(
	path: string,
	init?: { method?: string; body?: object },
) => Promise<{ status: number; body: T }>;

/**
 * An image the caller already holds (base64, or a data: URL), stored through
 * the same /v1/covers endpoint the web form uses.
 */
export type Upload = (
	data: string,
	contentType?: string,
) => Promise<{ status: number; body: { coverUrl?: string } }>;

/** What a tool comes back with: core's last answer, or the step that failed. */
export interface Reply {
	status: number;
	body: unknown;
	/** A step went wrong even though core did not say so by its status. */
	failed?: true;
}

/** An earlier step's answer, ending the tool as a failure. */
export const failed = (reply: { status: number; body: unknown }): Reply => ({
	...reply,
	failed: true,
});

/** A tool's input, field by field (zod's classic types, as MCP wants them). */
export type Fields = Record<string, z.ZodType>;

export interface Tool<Shape extends Fields = Fields> {
	name: string;
	description: string;
	input: Shape;
	run(
		input: z.infer<z.ZodObject<Shape>>,
		use: { call: Call; upload: Upload },
	): Promise<Reply>;
}

/** One tool, its input typed by its own schema; listed with the others. */
export function tool<Shape extends Fields>(
	name: string,
	description: string,
	input: Shape,
	run: Tool<Shape>["run"],
): Tool {
	return { name, description, input, run } as unknown as Tool;
}
