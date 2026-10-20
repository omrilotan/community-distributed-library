import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";

/** One message on a loan. Authors are member ids; core turns them into names. */
export const ThreadMessage = z.object({
	id: Id,
	loanId: Id,
	authorId: Id,
	body: z.string().min(1).max(1000),
	createdAt: Timestamp,
	/** Sent by an assistant for its author: the assistant's name. */
	via: z.string().nullable().optional(),
});

export const ReportKind = z.enum([
	"damage",
	"loss",
	"no_show",
	"conduct",
	"other",
]);

/**
 * A report filed on the loan, placed in the conversation where it happened.
 * Only its author and the moderators see it; the member it is about never does.
 */
export const ReportReply = z.object({
	id: Id,
	/** Written by a moderator; the reporter sees "the moderators", not a name. */
	fromModerators: z.boolean(),
	/** The author's name, for moderators; null for the reporter's view of a moderator. */
	authorName: z.string().nullable(),
	body: z.string(),
	createdAt: Timestamp,
});

export const ThreadReport = z.object({
	id: Id,
	kind: ReportKind,
	body: z.string().nullable(),
	reporterId: Id,
	createdAt: Timestamp,
	/** What the moderators did about it. */
	status: z.enum(["open", "resolved", "dismissed"]),
	resolution: z.string().nullable(),
	closedAt: Timestamp.nullable(),
	/** Between the reporter and the moderators only. */
	replies: z.array(ReportReply),
});

export const PostReportReply = z.object({
	body: z.string().trim().min(1).max(1000),
});

export const PostMessage = z.object({
	body: z.string().trim().min(1).max(1000),
});

/** What the web app shows: messages plus the two names, and whose side the viewer is on. */
export const LoanThread = z.object({
	loanId: Id,
	viewerId: Id,
	participants: z.record(Id, z.string()),
	messages: z.array(ThreadMessage),
	/** The viewer's own reports on this loan, if any. */
	reports: z.array(ThreadReport),
	/** Closed loans keep their thread readable but not writable. */
	open: z.boolean(),
});

export type ThreadMessage = z.infer<typeof ThreadMessage>;
export type PostMessage = z.input<typeof PostMessage>;
export type LoanThread = z.infer<typeof LoanThread>;
export type ThreadReport = z.infer<typeof ThreadReport>;
export type ReportReply = z.infer<typeof ReportReply>;
export type PostReportReply = z.infer<typeof PostReportReply>;
export type ReportKind = z.infer<typeof ReportKind>;
