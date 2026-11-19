import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";

/**
 * The notices the library keeps as news: everything it tells a member about
 * their loans, the things they wait for and, for moderators, what needs
 * them. Not sign-in links, invitations or messages to the library.
 */
export const NEWS_KINDS = [
	"loan_request",
	"loan_decision",
	"loan_message",
	"loan_nudge",
	"loan_reminder",
	"handoff",
	"waitlist_offer",
	"wishlist_available",
	"copy_damage",
	"report",
	"report_update",
	"librarian_digest",
] as const;
export const NewsKind = z.enum(NEWS_KINDS);

/** One thing the library told the member. Never the words, or who wrote them. */
export const NewsItem = z.object({
	kind: NewsKind,
	/** What kind of it: accepted or declined, the stage of a reminder or handover. */
	detail: z.string().nullable(),
	/** The title it is about, when it is about one. */
	title: z.string().nullable(),
	/** The page on the site that shows it. */
	url: z.url().nullable(),
	loanId: Id.nullable(),
	workId: Id.nullable(),
	at: Timestamp,
});

export const News = z.object({
	/** Oldest first. */
	news: z.array(NewsItem),
	/** Hand this to `POST /v1/me/news/seen` once the member has been told. */
	until: z.number().int().nonnegative(),
	/** There is more than one answer holds: ask again after marking these seen. */
	more: z.boolean(),
});

export const NewsSeen = z.object({ until: z.number().int().nonnegative() });

/** How many of each kind are new, by kind; empty when nothing is. */
export const NewsHint = z.object({
	counts: z.record(z.string(), z.number().int().positive()),
});

export type NewsKind = z.infer<typeof NewsKind>;
export type NewsItem = z.infer<typeof NewsItem>;
export type News = z.infer<typeof News>;
export type NewsSeen = z.infer<typeof NewsSeen>;
export type NewsHint = z.infer<typeof NewsHint>;
