import { z } from "zod";

/** ULID: 26 chars, Crockford base32, sortable by creation time. */
export const Id = z
	.string()
	.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "expected a ULID");

/** Unix epoch seconds, UTC. Every timestamp in the system is this. */
export const Timestamp = z.number().int().nonnegative();

/** BCP 47, restricted to what the UI ships. */
export const Locale = z.enum(["en", "he"]);

/** ISBN-13 digits only, check digit not verified here. */
export const Isbn13 = z.string().regex(/^\d{13}$/, "expected 13 digits");

export const Coordinates = z.object({
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
});

/**
 * What a member may see of another member's location before a handoff is
 * agreed: a label and a rounded distance, never coordinates.
 */
export const Area = z.object({
	label: z.string(),
	distanceM: z.number().int().nonnegative().nullable(),
	/** The ~300 m grid cell the member chose, for a map. Never a precise point. */
	approx: Coordinates.nullable(),
});

export type Id = z.infer<typeof Id>;
export type Timestamp = z.infer<typeof Timestamp>;
export type Locale = z.infer<typeof Locale>;
export type Isbn13 = z.infer<typeof Isbn13>;
export type Coordinates = z.infer<typeof Coordinates>;
export type Area = z.infer<typeof Area>;
