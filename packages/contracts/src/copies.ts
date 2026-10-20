import { z } from "zod";
import { Area, Id, Isbn13, Timestamp } from "./primitives.ts";
import { Edition, Work } from "./catalogue.ts";
import { ThingDetails } from "./library-types.ts";

/** Where a physical copy is: the spine of the system. */
export const CopyState = z.enum([
	"shelved",
	"reserved",
	"in_transit",
	"on_loan",
	"unavailable",
	"lost",
	"retired",
]);

export const Condition = z.enum(["new", "good", "worn", "fragile"]);
export const LendingPolicy = z.enum(["lendable", "reference", "paused"]);

/** A copy as another member sees it: owner reduced to an area. */
export const CopyListing = z.object({
	id: Id,
	state: CopyState,
	lending: LendingPolicy,
	/** `shelved` and `lendable`, and the owner is not at their lending limit. */
	available: z.boolean(),
	/** The owner has as many books out as they are willing to lend at once. */
	ownerAtLimit: z.boolean().default(false),
	/** The owner is away; the book is here, they are not. */
	ownerAway: z.boolean().default(false),
	/** The day they are back, when they said one. */
	ownerBackOn: z.number().int().nullable().default(null),
	condition: Condition,
	relayAllowed: z.boolean(),
	note: z.string().nullable(),
	/** How many of it: a set of 12 chairs is one item. */
	quantity: z.number().int().positive().default(1),
	/** Of a set, how many are not asked for or out; null for anything lent whole. */
	free: z.number().int().nonnegative().nullable().default(null),
	/** A thing's own details (brand, model, what's included); null for a book. */
	details: ThingDetails.nullable().default(null),
	/** A thing's photos, its owner's, the first being its picture everywhere. Empty for a book. */
	photos: z.array(z.string()).default([]),
	edition: Edition,
	work: Work,
	owner: z.object({ id: Id, displayName: z.string(), area: Area }),
});

export const AddCopyRequest = z
	.object({
		isbn13: Isbn13.optional(),
		/** Required when there is no ISBN — Hebrew and older books often have none. */
		manual: z
			.object({
				// The same limits a moderator's correction has (admin.ts): a
				// title long enough for any book, not for a letter.
				title: z.string().trim().min(1).max(200),
				authors: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
				language: z.string().trim().max(20).optional(),
				coverUrl: z.url().optional(),
			})
			.optional(),
		/**
		 * In a library of things, the item instead: always its own entry, never
		 * joined to another with the same name (two drills are two drills).
		 */
		thing: z
			.object({
				name: z.string().trim().min(1).max(120),
				/** Twelve folding chairs are one item with a quantity of 12. */
				quantity: z.number().int().min(1).max(500).default(1),
				details: ThingDetails.optional(),
				photoUrl: z.url().optional(),
				/** Up to four photos, in order; the first is its picture everywhere. */
				photoUrls: z.array(z.url()).max(4).optional(),
				/** A category tag's value, like "tools". */
				category: z.string().trim().min(1).max(60).optional(),
			})
			.optional(),
		condition: Condition.default("good"),
		lending: LendingPolicy.default("lendable"),
		/** On by default: passing a book straight to the next reader is the point (0006 amended). */
		relayAllowed: z.boolean().default(true),
		loanDays: z.number().int().positive().max(90).optional(),
		note: z.string().max(280).optional(),
	})
	.refine((value) => Boolean(value.isbn13 ?? value.manual ?? value.thing), {
		message: "provide isbn13, manual details or a thing",
	})
	.refine((value) => !(value.thing && (value.isbn13 ?? value.manual)), {
		message: "a thing has no ISBN, title or authors",
	});

/** Accepted cover uploads. Small on purpose: covers are thumbnails, not scans. */
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export const CoverContentType = z.enum([
	"image/jpeg",
	"image/png",
	"image/webp",
]);
export const CoverUploadResponse = z.object({ coverUrl: z.url() });
/** Alternative to multipart: core fetches the image itself (API clients, MCP). */
export const CoverFromUrl = z.object({ url: z.url().max(2048) });

/** The owner's view of one copy, with the fields they can change. */
/** What a book has done since it was listed. Its owner's business alone. */
export const CopyStats = z.object({
	addedAt: Timestamp,
	/** Loans that actually started; a cancelled request is not a reading. */
	loans: z.number().int().nonnegative(),
	lastLoanAt: Timestamp.nullable(),
	/** Days it has spent away, across every loan. */
	daysOut: z.number().int().nonnegative(),
	/** Different neighbours who have read it. */
	readers: z.number().int().nonnegative(),
});

export const CopyDetail = z.object({
	id: Id,
	state: CopyState,
	condition: Condition,
	lending: LendingPolicy,
	relayAllowed: z.boolean(),
	loanDays: z.number().int().positive().nullable(),
	note: z.string().nullable(),
	/** How many of it: a set of 12 chairs is one item. */
	quantity: z.number().int().positive().default(1),
	/** Of a set, how many are not asked for or out; null for anything lent whole. */
	free: z.number().int().nonnegative().nullable().default(null),
	/** A thing's own details (brand, model, what's included); null for a book. */
	details: ThingDetails.nullable().default(null),
	/** A thing's photos, its owner's, the first being its picture everywhere. Empty for a book. */
	photos: z.array(z.string()).default([]),
	createdAt: Timestamp,
	edition: Edition,
	work: Work,
	/** Title and authors are editable only when nobody else's copy shares the edition. */
	editable: z.object({ details: z.boolean() }),
	/** An open loan blocks removal and most edits. */
	openLoan: z.object({ id: Id, status: z.string() }).nullable(),
	stats: CopyStats,
});

export const UpdateCopy = z.object({
	condition: Condition.optional(),
	lending: LendingPolicy.optional(),
	relayAllowed: z.boolean().optional(),
	loanDays: z.number().int().positive().max(90).nullable().optional(),
	note: z.string().trim().max(280).nullable().optional(),
	coverUrl: z.url().optional(),
	title: z.string().trim().min(1).max(200).optional(),
	authors: z.array(z.string().trim().min(1).max(100)).min(1).max(10).optional(),
	/** A thing's details, replaced whole; null clears them. */
	details: ThingDetails.nullable().optional(),
	/** A thing's quantity. Not while it is out on loan. */
	quantity: z.number().int().min(1).max(500).optional(),
	/** A thing's photos, replaced whole and in order: up to four. */
	photos: z.array(z.url()).max(4).optional(),
});

/**
 * One book, not one copy. A small community often has the same title on three
 * shelves; the tile shows it once and says who has it and how far away they
 * are, nearest first, because that is what decides who you ask.
 */
export const WorkListing = z.object({
	work: Work,
	/** The fullest edition we hold of this work: cover, ISBN, publisher. */
	edition: Edition,
	/** Every copy in the community, nearest first. */
	copies: z.array(
		z.object({
			id: Id,
			state: CopyState,
			lending: LendingPolicy,
			available: z.boolean(),
			ownerAtLimit: z.boolean(),
			ownerAway: z.boolean(),
			ownerBackOn: z.number().int().nullable(),
			relayAllowed: z.boolean(),
			condition: Condition,
			note: z.string().nullable(),
			quantity: z.number().int().positive().default(1),
			free: z.number().int().nonnegative().nullable().default(null),
			details: ThingDetails.nullable().default(null),
			photos: z.array(z.string()).default([]),
			mine: z.boolean(),
			owner: z.object({ id: Id, displayName: z.string(), area: Area }),
		}),
	),
	/** Requestable right now, out of `copies.length`. */
	available: z.number().int().nonnegative(),
	/** Metres to the nearest copy, rounded; null when nobody has set an area. */
	nearestM: z.number().int().nonnegative().nullable(),
});

/** How a listing is ordered. `new` is what a member sees without asking. */
export const ListingSort = z.enum(["new", "title", "distance"]);

export const SearchRequest = z.object({
	q: z.string().trim().min(1).max(120),
	offset: z.number().int().nonnegative().default(0),
	/** Radius in metres. None unless the member asks: the whole library is in reach. */
	within: z.number().int().positive().max(20_000).optional(),
	limit: z.number().int().positive().max(240).default(20),
	sort: ListingSort.default("new"),
	/** Hide books nobody can borrow today. */
	availableOnly: z.boolean().default(false),
	/**
	 * The viewer's own copies are left out: browsing is for finding something
	 * to borrow. Asking for them back is the special case.
	 */
	includeOwn: z.boolean().default(false),
	/** Books the viewer has read are left out too, unless asked for. */
	includeRead: z.boolean().default(false),
});

export const SearchResponse = z.object({
	results: z.array(WorkListing),
	total: z.number().int().nonnegative(),
	/** Cursor for the next page, or null at the end. */
	nextOffset: z.number().int().nonnegative().nullable(),
});

/**
 * The shelves as somebody not signed in sees them: what the library holds,
 * and nothing about who holds it — no owners, no distances, no counts of
 * copies, nothing a neighbour put on their own copy.
 */
export const PublicShelvesRequest = z.object({
	q: z.string().trim().min(1).max(120).optional(),
	offset: z.number().int().nonnegative().default(0),
	limit: z.number().int().positive().max(240).default(24),
	/** Nearest-first needs a place to be near: not offered here. */
	sort: z.enum(["new", "title"]).default("new"),
});

export const PublicListing = z.object({
	work: Work.pick({ id: true, title: true, authors: true }),
	edition: Edition.pick({ title: true, coverUrl: true }),
});

export const PublicShelves = z.object({
	results: z.array(PublicListing),
	total: z.number().int().nonnegative(),
	nextOffset: z.number().int().nonnegative().nullable(),
});

export type CopyState = z.infer<typeof CopyState>;
export type Condition = z.infer<typeof Condition>;
export type LendingPolicy = z.infer<typeof LendingPolicy>;
export type CopyListing = z.infer<typeof CopyListing>;
export type AddCopyRequest = z.input<typeof AddCopyRequest>;
export type CopyDetail = z.infer<typeof CopyDetail>;
export type CopyStats = z.infer<typeof CopyStats>;
export type UpdateCopy = z.input<typeof UpdateCopy>;
export type CoverContentType = z.infer<typeof CoverContentType>;
export type CoverUploadResponse = z.infer<typeof CoverUploadResponse>;
export type CoverFromUrl = z.infer<typeof CoverFromUrl>;
export type ListingSort = z.infer<typeof ListingSort>;
export type SearchRequest = z.input<typeof SearchRequest>;
export type SearchResponse = z.infer<typeof SearchResponse>;
export type WorkListing = z.infer<typeof WorkListing>;
export type PublicShelvesRequest = z.input<typeof PublicShelvesRequest>;
export type PublicListing = z.infer<typeof PublicListing>;
export type PublicShelves = z.infer<typeof PublicShelves>;
