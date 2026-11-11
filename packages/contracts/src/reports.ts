import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";
import { ReportKind, ThreadMessage, ThreadReport } from "./thread.ts";

/** Filed from a loan: the other party is the subject. */
export const FileReport = z.object({
	kind: ReportKind,
	body: z.string().trim().max(1000).optional(),
});

export const ReportView = z.object({
	id: Id,
	kind: ReportKind,
	body: z.string().nullable(),
	status: z.enum(["open", "resolved", "dismissed"]),
	resolution: z.string().nullable(),
	reporter: z.object({ id: Id, displayName: z.string() }),
	subject: z.object({ id: Id, displayName: z.string() }).nullable(),
	loan: z.object({ id: Id, bookTitle: z.string() }).nullable(),
	createdAt: Timestamp,
	closedAt: Timestamp.nullable(),
});

/**
 * What a moderator sees when a report names a conversation: the report, and
 * the words themselves. Read-only — moderating is deciding, not joining in.
 */
export const ReportThread = z.object({
	report: ReportView,
	loanId: Id,
	participants: z.record(Id, z.string()),
	messages: z.array(ThreadMessage),
	/** Every report on this loan, this one among them, in the timeline. */
	reports: z.array(ThreadReport),
});

/**
 * Writing to whoever runs the library. Open to visitors as well as members: a
 * data request may come from somebody who cannot sign in any more.
 */
export const ContactRequest = z.object({
	topic: z.enum(["feedback", "data", "complaint"]),
	body: z.string().trim().min(1).max(4000),
	/** Required when nobody is signed in; otherwise the member's own address. */
	email: z.email().optional(),
});

export const CloseReport = z.object({
	resolution: z.string().trim().max(500).optional(),
});

/** Push the due date back. Days default to 7; two extensions per loan. */
export const ExtendLoan = z.object({
	days: z.number().int().min(1).max(21).default(7),
});
export const MAX_EXTENSIONS = 2;

export type FileReport = z.input<typeof FileReport>;
export type ContactRequest = z.input<typeof ContactRequest>;
export type ReportView = z.infer<typeof ReportView>;
export type ReportThread = z.infer<typeof ReportThread>;
export type CloseReport = z.input<typeof CloseReport>;
export type ExtendLoan = z.input<typeof ExtendLoan>;

/** A message to the library, as its admin reads it. */
export const ContactMessageView = z.object({
	id: Id,
	topic: z.enum(["feedback", "data", "complaint"]),
	body: z.string(),
	/** Where the answer goes. */
	email: z.string(),
	/** Who sent it, when they were signed in. */
	member: z.object({ id: Id, displayName: z.string() }).nullable(),
	createdAt: Timestamp,
	handledAt: Timestamp.nullable(),
});

export const ContactMessagePage = z.object({
	/** Data requests not yet marked handled: UK GDPR gives a month to answer. */
	dataRequests: z.object({
		open: z.number().int().nonnegative(),
		oldestAt: Timestamp.nullable(),
	}),
	page: z.number().int().positive(),
	pages: z.number().int().positive(),
	total: z.number().int().nonnegative(),
	messages: z.array(ContactMessageView),
});

export type ContactMessageView = z.infer<typeof ContactMessageView>;
export type ContactMessagePage = z.infer<typeof ContactMessagePage>;
