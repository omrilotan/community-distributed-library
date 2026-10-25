import { z } from "zod";
import { Locale } from "./primitives.ts";
import { LibraryType } from "./library-types.ts";

/** What `core` asks `notify` to deliver. One shape per kind; the channel decides how. */
export const MagicLinkMessage = z.object({
	kind: z.literal("magic_link"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	/** Minutes until the link dies, for the email body. */
	expiresInMinutes: z.number().int().positive(),
	/** Eight digits to type instead, in the browser that asked. */
	code: z
		.string()
		.regex(/^\d{8}$/)
		.optional(),
});

/** A moderator invited this address by email: one link that joins and signs in. */
export const InvitationMessage = z.object({
	kind: z.literal("invitation"),
	/** What the library lends, for the words: a book, or a thing. */
	libraryType: LibraryType.optional(),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	inviterName: z.string(),
	communityName: z.string(),
	/** Days until the link dies, for the email body. */
	expiresInDays: z.number().int().positive(),
});

/** A member checking that this device shows the library's notifications. */
export const PushTestMessage = z.object({
	kind: z.literal("push_test"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
});

/** Someone wants your book. */
export const LoanRequestMessage = z.object({
	kind: z.literal("loan_request"),
	/** What the library lends, for the words: a book, or a thing. */
	libraryType: LibraryType.optional(),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	borrowerName: z.string(),
	note: z.string().nullable(),
	/** The copy is out; this would be a relay from the current holder. */
	relay: z.boolean().default(false),
});

/** The lender answered. */
export const LoanDecisionMessage = z.object({
	kind: z.literal("loan_decision"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	lenderName: z.string(),
	accepted: z.boolean(),
});

/** A line from the other party on a loan. */
export const LoanMessageMessage = z.object({
	kind: z.literal("loan_message"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	fromName: z.string(),
	body: z.string(),
});

/** A gentle poke, worded by where the loan is. */
export const LoanNudgeMessage = z.object({
	kind: z.literal("loan_nudge"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	fromName: z.string(),
	stage: z.enum(["answer", "handoff", "due", "overdue"]),
	/** Days until due (stage `due`) or days overdue (stage `overdue`). */
	days: z.number().int().nonnegative(),
});

/** The library itself reminding someone — no person behind it. */
export const LoanReminderMessage = z.object({
	kind: z.literal("loan_reminder"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	otherName: z.string(),
	stage: z.enum(["unanswered", "due_soon", "overdue"]),
	days: z.number().int().nonnegative(),
});

/** Moderators: what needs a human. Sent when something crosses the line, not daily. */
export const ModeratorDigestMessage = z.object({
	kind: z.literal("librarian_digest"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	items: z.array(
		z.object({
			bookTitle: z.string(),
			borrowerName: z.string(),
			lenderName: z.string(),
			daysOverdue: z.number().int(),
		}),
	),
});

/** A handoff slot proposed or agreed; `place` only when the recipient may see it. */
export const HandoffMessage = z.object({
	kind: z.literal("handoff"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	otherName: z.string(),
	stage: z.enum(["proposed", "agreed"]),
	day: z.string(),
	period: z.enum(["morning", "afternoon", "evening"]),
	place: z.string().nullable(),
	code: z.string().nullable(),
});

/** A copy of a book you were waiting for is free — and held for you for a while. */
export const WaitlistOfferMessage = z.object({
	kind: z.literal("waitlist_offer"),
	/** What the library lends, for the words: a book, or a thing. */
	libraryType: LibraryType.optional(),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	ownerName: z.string(),
	hours: z.number().int().positive(),
});

/** A book on your wishlist is free to borrow near you. Nothing is held. */
export const WishlistMessage = z.object({
	kind: z.literal("wishlist_available"),
	/** What the library lends, for the words: a book, or a thing. */
	libraryType: LibraryType.optional(),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	ownerName: z.string(),
});

/** A member filed a report; moderators hear at once. */
export const ReportMessage = z.object({
	kind: z.literal("report"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	reportKind: z.string(),
	reporterName: z.string(),
	subjectName: z.string().nullable(),
	bookTitle: z.string().nullable(),
	body: z.string().nullable(),
});

/**
 * News on a report: a word from the other side of it (the moderators, or the
 * member who filed it), or what the moderators decided.
 */
export const ReportUpdateMessage = z.object({
	kind: z.literal("report_update"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string().nullable(),
	event: z.enum(["reply", "resolved", "dismissed"]),
	/** Going to the moderators (a reply from the reporter), or to the reporter. */
	toModerators: z.boolean(),
	/** The reply, or the note that came with the decision. */
	body: z.string().nullable(),
});

/**
 * A book reached its next reader in a state worth mentioning. The owner is not
 * in the handover — the book went from one borrower to the next — so this is
 * the only way they would hear.
 */
export const CopyDamageMessage = z.object({
	kind: z.literal("copy_damage"),
	to: z.email(),
	locale: Locale,
	url: z.url(),
	bookTitle: z.string(),
	reporterName: z.string(),
	/** Who handed it over, when that was not the owner. */
	fromName: z.string().nullable(),
	body: z.string().nullable(),
});

/** Somebody wrote to whoever runs the library: feedback, a request, a complaint. */
export const ContactMessage = z.object({
	kind: z.literal("contact"),
	to: z.email(),
	locale: Locale,
	topic: z.enum(["feedback", "data", "complaint"]),
	fromEmail: z.email(),
	fromName: z.string().nullable(),
	body: z.string(),
});

export const Message = z.discriminatedUnion("kind", [
	MagicLinkMessage,
	InvitationMessage,
	PushTestMessage,
	LoanRequestMessage,
	LoanDecisionMessage,
	LoanMessageMessage,
	LoanNudgeMessage,
	LoanReminderMessage,
	ModeratorDigestMessage,
	HandoffMessage,
	WaitlistOfferMessage,
	WishlistMessage,
	ReportMessage,
	ReportUpdateMessage,
	ContactMessage,
	CopyDamageMessage,
]);

export const Delivery = z.object({
	delivered: z.boolean(),
	channel: z.enum(["email", "console"]),
	/**
	 * Not delivered, but worth sending again later: the email service was
	 * unreachable, busy or failing, rather than refusing this message.
	 */
	retry: z.boolean().optional(),
});

export type ContactMessage = z.infer<typeof ContactMessage>;
export type CopyDamageMessage = z.infer<typeof CopyDamageMessage>;
export type ReportUpdateMessage = z.infer<typeof ReportUpdateMessage>;
export type MagicLinkMessage = z.infer<typeof MagicLinkMessage>;
export type InvitationMessage = z.infer<typeof InvitationMessage>;
export type PushTestMessage = z.infer<typeof PushTestMessage>;
export type LoanRequestMessage = z.infer<typeof LoanRequestMessage>;
export type LoanDecisionMessage = z.infer<typeof LoanDecisionMessage>;
export type LoanMessageMessage = z.infer<typeof LoanMessageMessage>;
export type LoanNudgeMessage = z.infer<typeof LoanNudgeMessage>;
export type LoanReminderMessage = z.infer<typeof LoanReminderMessage>;
export type ModeratorDigestMessage = z.infer<typeof ModeratorDigestMessage>;
export type HandoffMessage = z.infer<typeof HandoffMessage>;
export type WaitlistOfferMessage = z.infer<typeof WaitlistOfferMessage>;
export type WishlistMessage = z.infer<typeof WishlistMessage>;
export type ReportMessage = z.infer<typeof ReportMessage>;
export type Message = z.infer<typeof Message>;
export type Delivery = z.infer<typeof Delivery>;
