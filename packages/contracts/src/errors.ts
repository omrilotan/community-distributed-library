import { z } from "zod";

/** RFC 9457 problem document — the only error shape the API returns. */
export const Problem = z.object({
	type: z.string().default("about:blank"),
	title: z.string(),
	status: z.number().int().min(400).max(599),
	detail: z.string().optional(),
	instance: z.string().optional(),
	/** Seconds to wait, on a 429. Mirrors the Retry-After header. */
	retryAfter: z.number().int().positive().optional(),
	errors: z
		.array(z.object({ path: z.string(), message: z.string() }))
		.optional(),
});

export type Problem = z.infer<typeof Problem>;

export function problem(
	status: number,
	title: string,
	detail?: string,
): Problem {
	return { type: "about:blank", title, status, ...(detail ? { detail } : {}) };
}
