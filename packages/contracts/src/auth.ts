import { z } from "zod";
import { Id, Locale, Timestamp } from "./primitives.ts";

export const Email = z
	.email()
	.max(254)
	.transform((value) => value.trim().toLowerCase());

/** Ask for a sign-in link. `invite` is required for an address that is not yet a member. */
export const MagicLinkRequest = z.object({
	email: Email,
	invite: z.string().min(16).max(128).optional(),
	locale: Locale.default("en"),
	/**
	 * A random value the asking browser keeps. With it the email also carries
	 * a code that signs in that browser alone (CodeRequest).
	 */
	browser: z.string().min(32).max(128).optional(),
});

/** Sign in with the email's code, from the browser that asked for it. */
export const CodeRequest = z.object({
	browser: z.string().min(32).max(128),
	code: z.string().regex(/^\d{8}$/),
});

/** Always the same shape whether or not the address is known — no enumeration. */
export const MagicLinkResponse = z.object({
	ok: z.literal(true),
	/** Only present when DEV_AUTH is on; lets local development skip the email. */
	debugUrl: z.url().optional(),
	/** Only present when DEV_AUTH is on and a browser was named: the email's code. */
	debugCode: z.string().optional(),
	/** Only present when DEV_AUTH is on: the address is not a member and no invite was given. */
	debugReason: z.enum(["unknown_email"]).optional(),
});

export const ExchangeRequest = z.object({ token: z.string().min(16).max(128) });

export const Session = z.object({
	/** Opaque bearer token. The web app keeps it in an httpOnly cookie. */
	token: z.string(),
	memberId: Id,
	expiresAt: Timestamp,
	/** True when the exchange created the member — the client should collect a profile. */
	isNew: z.boolean(),
});

export const Me = z.object({
	id: Id,
	email: Email,
	displayName: z.string(),
	locale: Locale,
	area: z
		.object({ label: z.string(), lat: z.number(), lng: z.number() })
		.nullable(),
	communityId: Id,
	community: z.object({
		name: z.string(),
		centre: z.object({ lat: z.number(), lng: z.number() }),
		radiusM: z.number().int(),
		/** Everyone lives close by: no area asked for, no map, no distances. */
		compact: z.boolean().default(false),
	}),
	role: z.enum(["member", "moderator", "admin"]),
	/** How many books this member will have out at once; null is no limit. */
	lendLimit: z.number().int().positive().nullable().default(null),
	/**
	 * Away until this day, in unix seconds; null means here. Books stay listed
	 * and stay unrequestable until then.
	 */
	awayUntil: z.number().int().nullable().default(null),
	/** Requests to answer and handoffs to confirm: the badge on the loans tab. */
	attention: z.number().int().nonnegative().default(0),
	/** For moderators: tag suggestions waiting and reports open. 0 for members. */
	moderation: z.number().int().nonnegative().default(0),
	/** How they last had the shelves filtered and ordered, as a query string. */
	browsePrefs: z.string().nullable().default(null),
});

export const UpdateMe = z.object({
	displayName: z.string().trim().min(1).max(60).optional(),
	locale: Locale.optional(),
	/** Books out at once, at most. Null lifts the limit. */
	lendLimit: z.number().int().positive().max(999).nullable().optional(),
	/**
	 * Go away until this day, or come back early with null. A day far enough
	 * ahead to be a holiday and near enough to be one: a year at most.
	 */
	awayUntil: z.number().int().positive().nullable().optional(),
	/** The shelves' filters and order to keep; null forgets them. Site only. */
	browsePrefs: z.string().max(500).nullable().optional(),
	/**
	 * Coarse area; core snaps it to a grid before storing (08-trust-privacy-safety).
	 * Without a point, core places the name itself: a place or postcode it can
	 * find near the library, or else the library's centre.
	 */
	area: z
		.object({
			label: z.string().trim().min(1).max(60),
			lat: z.number().min(-90).max(90).optional(),
			lng: z.number().min(-180).max(180).optional(),
		})
		.optional(),
});

export const CreateInvite = z.object({
	maxUses: z.number().int().min(1).max(50).default(1),
	/** Days until expiry; capped so a link in an old chat message dies. */
	days: z.number().int().min(1).max(30).default(7),
});

/**
 * An invite I made. It carries no link: only a hash of the token is kept, so
 * the link exists once, at creation, and then only in whatever I sent it in.
 */
export const MyInvite = z.object({
	id: Id,
	maxUses: z.number().int(),
	uses: z.number().int(),
	expiresAt: Timestamp,
	createdAt: Timestamp,
	revokedAt: Timestamp.nullable(),
	/** Who has joined on it so far. */
	joined: z.array(z.object({ id: Id, displayName: z.string() })),
});

export const Invite = z.object({
	id: Id,
	/** Plain token, returned once at creation. */
	token: z.string(),
	url: z.url(),
	maxUses: z.number().int(),
	expiresAt: Timestamp,
});

export type MagicLinkRequest = z.input<typeof MagicLinkRequest>;
export type MagicLinkResponse = z.infer<typeof MagicLinkResponse>;
export type ExchangeRequest = z.infer<typeof ExchangeRequest>;
export type CodeRequest = z.infer<typeof CodeRequest>;
export type Session = z.infer<typeof Session>;
export type Me = z.infer<typeof Me>;
export type UpdateMe = z.input<typeof UpdateMe>;
export type CreateInvite = z.input<typeof CreateInvite>;
export type Invite = z.infer<typeof Invite>;
export type MyInvite = z.infer<typeof MyInvite>;

/** The same figures, added up across everything a member owns. */
export const MemberStats = z.object({
	memberSince: Timestamp,
	books: z.number().int().nonnegative(),
	/** Times a book of mine went out, and days they spent away in total. */
	lent: z.number().int().nonnegative(),
	daysOut: z.number().int().nonnegative(),
	/** Different neighbours who have read one of my books. */
	readers: z.number().int().nonnegative(),
	borrowed: z.number().int().nonnegative(),
	/** Out right now, both ways. */
	outNow: z.number().int().nonnegative(),
	borrowedNow: z.number().int().nonnegative(),
});

export type MemberStats = z.infer<typeof MemberStats>;
