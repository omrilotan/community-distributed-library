import { z } from "zod";
import { Tag } from "./tags.ts";
import { Id, Isbn13, Timestamp } from "./primitives.ts";

export const Work = z.object({
	id: Id,
	title: z.string().min(1),
	authors: z.array(z.string().min(1)),
	createdAt: Timestamp,
	/** Curated tags on the book itself, shared by every copy of it. */
	tags: z.array(Tag).default([]),
	/** A moderator's few words about the book, shown to everyone. */
	note: z.string().nullable().default(null),
});

export const Edition = z.object({
	id: Id,
	workId: Id,
	isbn13: Isbn13.nullable(),
	title: z.string().min(1),
	publisher: z.string().nullable(),
	publishedYear: z.number().int().nullable(),
	/** BCP 47 as the source reports it — the catalogue is not limited to en/he. */
	language: z.string().nullable(),
	pageCount: z.number().int().positive().nullable(),
	coverUrl: z.url().nullable(),
});

/** What `metadata` returns for an ISBN. Provider-agnostic on purpose. */
export const MetadataLookup = z.object({
	isbn13: Isbn13,
	title: z.string().min(1),
	authors: z.array(z.string().min(1)),
	publisher: z.string().nullable(),
	publishedYear: z.number().int().nullable(),
	language: z.string().nullable(),
	pageCount: z.number().int().positive().nullable(),
	coverUrl: z.url().nullable(),
	source: z.enum(["openlibrary", "googlebooks"]),
});

export type Work = z.infer<typeof Work>;
export type Edition = z.infer<typeof Edition>;
export type MetadataLookup = z.infer<typeof MetadataLookup>;
