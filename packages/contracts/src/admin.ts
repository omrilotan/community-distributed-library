import { z } from "zod";
import { Accent } from "./accent.ts";
import { Email } from "./auth.ts";
import { Id, Timestamp } from "./primitives.ts";

/** Moderator-only surface. Everything here is scoped to the moderator's community. */

/**
 * A moderator looks after the community: members, books, tags, reports. The
 * library's admin can do all of that, and what is theirs alone (tracing how
 * people came in, auditing) as it arrives.
 */
export const Role = z.enum(["member", "moderator", "admin"]);
export const MembershipStatus = z.enum([
	"pending",
	"active",
	"suspended",
	"left",
]);

export const AdminMember = z.object({
	id: Id,
	/** The library admin's to see; null for a moderator. */
	email: Email.nullable(),
	displayName: z.string(),
	areaLabel: z.string().nullable(),
	role: Role,
	status: MembershipStatus,
	copies: z.number().int().nonnegative(),
	joinedAt: Timestamp,
	lastSeenAt: Timestamp.nullable(),
	/** On a member's own page: whether they said where they meet; never the place itself. */
	hasMeetingPlace: z.boolean().default(false),
	/** Whether they ticked any times they can meet. */
	hasAvailability: z.boolean().default(false),
});

const Person = z.object({ id: Id, displayName: z.string() });

/** A report, as a line on a member's page. */
export const MemberReport = z.object({
	id: Id,
	kind: z.string(),
	status: z.enum(["open", "resolved", "dismissed"]),
	createdAt: Timestamp,
	/** The other side: who they reported, or who reported them. */
	other: Person.nullable(),
});

/**
 * One member, for the moderators: who they are, how they came in, who they
 * brought, and what has been reported by or about them.
 */
export const AdminMemberDetail = z.object({
	member: AdminMember,
	invitedBy: Person.nullable(),
	/** The link they joined on. */
	invite: z
		.object({
			id: Id,
			createdBy: Person,
			createdAt: Timestamp,
			uses: z.number().int(),
			maxUses: z.number().int(),
		})
		.nullable(),
	/**
	 * Who invited whom, from this member back to whoever started the chain.
	 * The library admin's to see; null for a moderator.
	 */
	trail: z.array(Person.extend({ joinedAt: Timestamp.nullable() })).nullable(),
	invited: z.array(
		Person.extend({ joinedAt: Timestamp, status: MembershipStatus }),
	),
	/** Invite links of theirs that could still let somebody in; the admin's. */
	openInvites: z
		.array(
			z.object({
				id: Id,
				createdAt: Timestamp,
				expiresAt: Timestamp,
				uses: z.number().int(),
				maxUses: z.number().int(),
			}),
		)
		.nullable(),
	reportsFiled: z.array(MemberReport),
	reportsAbout: z.array(MemberReport),
	loans: z.object({
		borrowed: z.number().int(),
		lent: z.number().int(),
		open: z.number().int(),
	}),
});

export const SetRole = z.object({ role: Role });
export const SetStatus = z.object({ status: z.enum(["active", "suspended"]) });

export const InviteSummary = z.object({
	id: Id,
	createdBy: z.string(),
	maxUses: z.number().int(),
	uses: z.number().int(),
	expiresAt: Timestamp,
	createdAt: Timestamp,
	revokedAt: Timestamp.nullable(),
	/** The address a moderator sent it to; null for a link handed on by hand. */
	sentTo: z.string().nullable().default(null),
});

/** A moderator inviting one person by email, without a link to pass on. */
export const EmailInvite = z.object({
	email: z.email().trim().toLowerCase().max(254),
});
export type EmailInvite = z.infer<typeof EmailInvite>;

/** Every copy shared with the community, as the moderator sees it. */
export const AdminCopy = z.object({
	id: Id,
	/** The book this is a copy of, so a row can lead to its page. */
	workId: Id,
	title: z.string(),
	authors: z.array(z.string()),
	coverUrl: z.string().nullable(),
	state: z.string(),
	lending: z.string(),
	owner: z.object({ id: Id, displayName: z.string() }),
	openLoan: z
		.object({ id: Id, status: z.string(), borrowerName: z.string() })
		.nullable(),
	createdAt: Timestamp,
});

/** Loans a moderator should look at: overdue past the escalation line, or requests nobody answered. */
export const AttentionItem = z.object({
	loanId: Id.nullable(),
	kind: z.enum(["overdue", "unanswered", "report", "tag", "suspended"]),
	reportId: Id.nullable(),
	reportKind: z.string().nullable(),
	body: z.string().nullable(),
	bookTitle: z.string(),
	borrowerName: z.string(),
	lenderName: z.string(),
	days: z.number().int(),
	/**
	 * Whether the moderator reading this is the borrower or the lender. Only
	 * then can they open the loan; otherwise the thread is not theirs to read
	 * unless a report opened it.
	 */
	mine: z.boolean().default(false),
	/** On a "suspended" item: who was suspended, and where the loan stands. */
	suspendedName: z.string().nullable().default(null),
	loanStatus: z.string().nullable().default(null),
});

/**
 * A moderator settling a loan whose borrower or owner was suspended: called
 * off before the handover, or after it the book came back or is gone.
 */
export const CloseLoan = z.object({
	outcome: z.enum(["cancelled", "returned", "lost"]),
});

export type CloseLoan = z.infer<typeof CloseLoan>;

export const CommunityStats = z.object({
	name: z.string(),
	members: z.number().int(),
	moderators: z.number().int(),
	copies: z.number().int(),
	lendable: z.number().int(),
	activeInvites: z.number().int(),
	/** Books out with a reader right now. */
	activeLoans: z.number().int(),
});

/** One loan, as a line on the moderators' Loans tab. No messages. */
export const AdminLoan = z.object({
	id: Id,
	status: z.string(),
	book: z.object({ workId: Id, title: z.string() }),
	lender: z.object({ id: Id, displayName: z.string() }),
	borrower: z.object({ id: Id, displayName: z.string() }),
	requestedAt: Timestamp,
	startedAt: Timestamp.nullable(),
	dueAt: Timestamp.nullable(),
	closedAt: Timestamp.nullable(),
});

export const AdminLoanPage = z.object({
	page: z.number().int().positive(),
	pages: z.number().int().positive(),
	total: z.number().int().nonnegative(),
	loans: z.array(AdminLoan),
});

export type AdminLoan = z.infer<typeof AdminLoan>;
export type AdminLoanPage = z.infer<typeof AdminLoanPage>;

export type AdminMember = z.infer<typeof AdminMember>;
export type AdminMemberDetail = z.infer<typeof AdminMemberDetail>;
export type MemberReport = z.infer<typeof MemberReport>;
export type SetRole = z.infer<typeof SetRole>;
export type SetStatus = z.infer<typeof SetStatus>;
export type InviteSummary = z.infer<typeof InviteSummary>;
export type CommunityStats = z.infer<typeof CommunityStats>;
export type AdminCopy = z.infer<typeof AdminCopy>;
export type AttentionItem = z.infer<typeof AttentionItem>;

/** A moderator correcting a book's own details, not anybody's copy. */
export const EditWork = z.object({
	title: z.string().trim().min(1).max(200).optional(),
	authors: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
	/** A few words for everyone: the edition, a series. Null clears it. */
	note: z.string().trim().max(500).nullable().optional(),
	/**
	 * Fetched into our own bucket, wherever it points (decision 0028). The
	 * cover belongs to the edition, so it only applies to a book with one —
	 * with several there is no telling which is in front of the moderator,
	 * and merging is the tool for that.
	 */
	coverUrl: z.url().nullable().optional(),
});

export type EditWork = z.input<typeof EditWork>;

/** One change made through moderation, for the admin's log. */
export const LogEntry = z.object({
	id: Id,
	actor: z.object({ id: Id, displayName: z.string() }),
	/** "POST /v1/admin/members/:id/role", as the route was called. */
	action: z.string(),
	target: z.string().nullable(),
	/** When the target is a member, their name. */
	targetName: z.string().nullable(),
	details: z.string().nullable(),
	/** The assistant that made the change; null when made on the site. */
	via: z.string().nullable(),
	createdAt: Timestamp,
});

export const LogPage = z.object({
	page: z.number().int().positive(),
	pages: z.number().int().positive(),
	total: z.number().int().nonnegative(),
	entries: z.array(LogEntry),
});

export type LogEntry = z.infer<typeof LogEntry>;
export type LogPage = z.infer<typeof LogPage>;

/** What a library says about itself in one language. Any part may be missing. */
export const LibraryText = z.object({
	/** The name in this language; missing, the library's name is used. */
	name: z.string().trim().min(1).max(80).optional(),
	/**
	 * A word or two where space is short: the header on a phone, the label
	 * under the home-screen icon. Missing, "Library" in that language.
	 */
	shortName: z.string().trim().min(1).max(20).optional(),
	/** One sentence under the name on the front page and in link previews. */
	tagline: z.string().trim().min(1).max(300).optional(),
	/** Who the library is for, on the about page. */
	about: z.string().trim().min(1).max(1000).optional(),
});

/** The library's words, by language. */
export const LibraryTexts = z
	.object({ en: LibraryText.optional(), he: LibraryText.optional() })
	.strict();

export type LibraryText = z.infer<typeof LibraryText>;
export type LibraryTexts = z.infer<typeof LibraryTexts>;

/** What the library's admin decides for their library. */
export const LibrarySettings = z.object({
	name: z.string().trim().min(1).max(80),
	/** A loan's length unless the owner set their own. */
	loanDays: z.number().int().min(1).max(90),
	/** Invite links a member may have open at once; 0 leaves inviting to moderators. */
	memberInvitesOpen: z.number().int().min(0).max(20),
	/** How long a member's invite link stays good. */
	memberInviteDays: z.number().int().min(1).max(30),
	/** What the site opens in for somebody who has not chosen a language. Left out, it stays. */
	defaultLocale: z.enum(["en", "he"]).optional(),
	/**
	 * The languages the library offers; the default must be one of them. With
	 * one, the site has no language switch. Left out, they stay.
	 */
	languages: z
		.array(z.enum(["en", "he"]))
		.min(1)
		.max(2)
		.refine((list) => new Set(list).size === list.length)
		.optional(),
	/**
	 * Everyone lives close by: members give no area, and the site shows no map
	 * or distances. Left out, it stays.
	 */
	compact: z.boolean().optional(),
	/** The library's name, tagline and about text by language. Left out, they stay. */
	texts: LibraryTexts.optional(),
	/**
	 * Where the library is: a place name, with its point when the map or a
	 * suggestion gave one (a name alone is placed by core). Places are
	 * suggested near it, and distances measured from it. Left out, it stays.
	 */
	centre: z
		.object({
			label: z.string().trim().max(80),
			lat: z.number().min(-90).max(90).optional(),
			lng: z.number().min(-180).max(180).optional(),
		})
		// A name to place, or a point (a centre read back may have no name yet).
		.refine(
			(centre) =>
				centre.label || (centre.lat !== undefined && centre.lng !== undefined),
		)
		.optional(),
	/** How far the library reaches, in metres. Left out, it stays. */
	radiusM: z.number().int().min(100).max(50_000).optional(),
	/**
	 * The library's own colour; buttons, links and its name take it, made
	 * lighter or darker where needed to stay readable. Null goes back to the
	 * house green. Left out, it stays.
	 */
	accent: Accent.nullable().optional(),
});

export type LibrarySettings = z.infer<typeof LibrarySettings>;
