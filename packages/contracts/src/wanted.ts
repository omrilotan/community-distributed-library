import { z } from "zod";
import { Id, Isbn13 } from "./primitives.ts";

/** "Can't find it? Ask for it": an ISBN, or a title with whatever authors are known. */
export const WantedRequest = z
	.object({
		isbn13: Isbn13.optional(),
		title: z.string().trim().min(1).max(200).optional(),
		authors: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
	})
	.refine((value) => Boolean(value.isbn13 ?? value.title), {
		message: "provide isbn13 or a title",
	});

export const WantedResponse = z.object({
	workId: Id,
	position: z.number().int().positive(),
});

/** A book neighbours are waiting for and nobody has on the shelf. */
export const WantedWork = z.object({
	workId: Id,
	title: z.string(),
	authors: z.array(z.string()),
	coverUrl: z.string().nullable(),
	isbn13: z.string().nullable(),
	waiting: z.number().int().positive(),
});

/** Public: what a shared link may show before signing in. No members, no places. */
export const WorkCard = z.object({
	id: Id,
	title: z.string(),
	authors: z.array(z.string()),
	coverUrl: z.string().nullable(),
	isbn13: z.string().nullable(),
	copies: z.number().int().nonnegative(),
	waiting: z.number().int().nonnegative(),
});

export type WantedRequest = z.input<typeof WantedRequest>;
export type WantedResponse = z.infer<typeof WantedResponse>;
export type WantedWork = z.infer<typeof WantedWork>;
export type WorkCard = z.infer<typeof WorkCard>;
