import { z } from "zod";
import {
	CodeRequest,
	CreateInvite,
	ExchangeRequest,
	Invite,
	MagicLinkRequest,
	MagicLinkResponse,
	Me,
	MemberStats,
	MyInvite,
	Session,
	UpdateMe,
} from "./auth.ts";
import {
	AddCopyRequest,
	CopyDetail,
	CoverFromUrl,
	CoverUploadResponse,
	PublicShelves,
	PublicShelvesRequest,
	SearchRequest,
	SearchResponse,
	UpdateCopy,
} from "./copies.ts";
import { MetadataLookup } from "./catalogue.ts";
import { LibraryType, ThingDetails } from "./library-types.ts";
import { Problem } from "./errors.ts";
import {
	BrowseRequest,
	BrowseResponse,
	LoanStatus,
	MyLoans,
	RequestLoan,
	WishlistResponse,
	WorkPage,
} from "./loans.ts";
import {
	LoanThread,
	PostMessage,
	PostReportReply,
	ThreadMessage,
} from "./thread.ts";
import {
	Availability,
	CompleteHandoff,
	HandoffView,
	ProposeHandoff,
	SlotOption,
} from "./handoffs.ts";
import { JoinWaitlist, WaitlistEntry } from "./waitlist.ts";
import {
	CloseReport,
	ContactMessagePage,
	ContactRequest,
	ExtendLoan,
	FileReport,
	ReportThread,
	ReportView,
} from "./reports.ts";
import {
	AdminCopy,
	AdminLoanPage,
	AdminMember,
	AdminMemberDetail,
	AttentionItem,
	CloseLoan,
	CommunityStats,
	EditWork,
	EmailInvite,
	InviteSummary,
	LibrarySettings,
	LibraryTexts,
	LogPage,
	SetRole,
	SetStatus,
} from "./admin.ts";
import {
	ApproveClient,
	ConsentCode,
	CreateToken,
	TokenCreated,
	TokenSummary,
	type Scope,
} from "./tokens.ts";
import { Id, Locale, Timestamp } from "./primitives.ts";
import {
	WantedRequest,
	WantedResponse,
	WantedWork,
	WorkCard,
} from "./wanted.ts";
import {
	ApproveTag,
	CreateTag,
	DeclineTag,
	EditNamespace,
	ProposeTag,
	SetWorkTags,
	Tag,
	TagCount,
	TaggingOnly,
	TaggingStep,
	TagMatch,
	TagProposal,
	Vocabulary,
} from "./tags.ts";
import {
	CreateWebhook,
	DeliveryView,
	EventView,
	EventsQuery,
	WebhookCreated,
	WebhookView,
} from "./webhooks.ts";
import { CopyState, Condition, LendingPolicy } from "./copies.ts";

/**
 * The public REST surface, as data. The OpenAPI document is generated from
 * this list and the Zod schemas beside it — nothing is hand-written, so a
 * new route is a new entry here.
 */

type Method = "get" | "post" | "put" | "patch" | "delete";

/**
 * Who may call: a scope; any signed-in member, whatever their token's scopes;
 * a moderator, or the library's admin alone (both with the admin scope); a
 * browser session only; or anyone.
 */
type Access =
	Scope | "member" | "moderator" | "library-admin" | "session" | "public";

interface Route {
	method: Method;
	path: string;
	tag: string;
	summary: string;
	access: Access;
	query?: z.ZodObject;
	body?: z.ZodType;
	multipart?: boolean;
	/** Omitted means 204 No Content. */
	response?: z.ZodType;
	/** A response that is a file rather than JSON: its media type. */
	file?: string;
	status?: number;
	/** What the summary leaves out, as the operation's description. */
	note?: string;
}

const ShelfCopy = z.object({
	id: Id,
	state: CopyState,
	condition: Condition,
	lending: LendingPolicy,
	relayAllowed: z.boolean(),
	note: z.string().nullable(),
	title: z.string(),
	authors: z.array(z.string()),
	coverUrl: z.string().nullable(),
	/** A set's size, and how many of it are not asked for or out (null for anything lent whole). */
	quantity: z.number().int().positive(),
	free: z.number().int().nonnegative().nullable(),
	/** A thing's own details; null for a book. */
	details: ThingDetails.nullable(),
});

const Created = z.object({ id: Id });

/** Tag filtering rides on the listing endpoints as query parameters. */
const TAG_QUERY = {
	tags: z.string().optional().meta({
		description: "Comma-separated tag slugs, e.g. genre:fiction,language:he",
	}),
	match: TagMatch.default("facets").meta({
		description:
			"facets: OR inside a namespace, AND across them. any: OR everywhere. all: AND everywhere.",
	}),
};

/**
 * The listings' switches as the query string carries them: "1" turns one on;
 * anything else, or nothing, leaves it off.
 */
const switched = (description: string) =>
	z.literal("1").optional().meta({ description });
const LISTING_QUERY = {
	availableOnly: switched("Only what can be borrowed today"),
	showMine: switched("Include your own copies"),
	showRead: switched("Include books you have read"),
	wished: switched("Only books you keep to read"),
	...TAG_QUERY,
};
/** The switches' names inside the listing requests, which travel differently. */
const SWITCH_FIELDS = {
	availableOnly: true,
	includeOwn: true,
	includeRead: true,
} as const;

/** A page of a moderator's list, counted from 1. */
const PAGE_QUERY = z.object({ page: z.number().int().positive().optional() });

/** A tagging queue's place: its books without a tag, without one in a group, or all of them. */
const TAGGING_QUERY = z.object({
	only: TaggingOnly.optional(),
	at: z.number().int().nonnegative().optional(),
});

/** A book that may be the same as another, as a person is shown it. */
const LookAlike = z.object({
	id: Id,
	title: z.string(),
	authors: z.array(z.string()),
	coverUrl: z.string().nullable(),
	/** How close, 0–1. */
	score: z.number(),
	/** Who here has a copy, to recognise the book by. */
	owners: z.array(z.string()),
});

/** A browser's notification subscription, as the Push API gives it. */
const PushSubscription = z.object({
	endpoint: z.url(),
	keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

/** A place to pick an area by. */
const Place = z.object({
	name: z.string(),
	lat: z.number(),
	lng: z.number(),
	/** What tells two places apart: their borough or postcode district. */
	detail: z.string().nullable(),
});

export const ROUTES: readonly Route[] = [
	// Catalogue
	{
		method: "get",
		path: "/v1/search",
		tag: "Catalogue",
		summary:
			"Search copies near you by title or author, optionally filtered by tags",
		access: "catalogue:read",
		query: SearchRequest.omit(SWITCH_FIELDS).extend(LISTING_QUERY),
		response: SearchResponse,
	},
	{
		method: "get",
		path: "/v1/browse",
		tag: "Catalogue",
		summary:
			"Everything on the shelves, nearest first, optionally filtered by tags",
		access: "catalogue:read",
		query: BrowseRequest.omit(SWITCH_FIELDS).extend(LISTING_QUERY),
		response: BrowseResponse,
	},
	{
		method: "get",
		path: "/v1/works/:id",
		tag: "Catalogue",
		summary: "A work and the copies of it in your community",
		access: "catalogue:read",
		response: WorkPage,
	},
	{
		method: "get",
		path: "/v1/lookup/:isbn",
		tag: "Catalogue",
		summary: "Book metadata for an ISBN-13 from the public providers",
		access: "catalogue:read",
		response: MetadataLookup,
		note: "404 when no provider knows the ISBN.",
	},

	{
		method: "get",
		path: "/v1/public/shelves",
		tag: "Catalogue",
		summary:
			"What the library holds, for somebody not signed in: titles, authors and covers only",
		access: "public",
		query: PublicShelvesRequest.extend(TAG_QUERY),
		response: PublicShelves,
		note: "Nothing about who holds a book, where, or whether it is free to borrow.",
	},
	{
		method: "get",
		path: "/v1/public/tags",
		tag: "Catalogue",
		summary: "The tag vocabulary, for filtering the public shelves",
		access: "public",
		response: Vocabulary,
	},
	{
		method: "get",
		path: "/v1/tags",
		tag: "Catalogue",
		summary:
			"The tag vocabulary: labels, values and how many books carry each here",
		access: "catalogue:read",
		response: Vocabulary.extend({ counts: z.array(TagCount) }),
	},
	{
		method: "post",
		path: "/v1/tags/proposals",
		tag: "Catalogue",
		summary:
			"Suggest a tag value, or a whole new label. A moderator approves before it joins the vocabulary",
		access: "shelf:write",
		body: ProposeTag,
		response: z.object({ id: Id, status: z.literal("pending") }),
		status: 201,
	},
	{
		method: "get",
		path: "/v1/me/tag-proposals",
		tag: "Catalogue",
		summary: "Suggestions I have made and what became of them",
		access: "catalogue:read",
		response: z.object({ proposals: z.array(TagProposal) }),
	},
	{
		method: "get",
		path: "/v1/works/:id/tags",
		tag: "Catalogue",
		summary: "A book's tags",
		access: "catalogue:read",
		response: z.object({ tags: z.array(Tag) }),
	},
	{
		method: "put",
		path: "/v1/works/:id/tags",
		tag: "Catalogue",
		summary:
			"Set a book's tags (any member who owns a copy of it, or a moderator)",
		access: "shelf:write",
		body: SetWorkTags,
	},
	{
		method: "get",
		path: "/v1/works/:id/card",
		tag: "Catalogue",
		summary: "Public card for link previews: title, authors, cover, counts",
		access: "public",
		response: WorkCard,
	},
	{
		method: "get",
		path: "/v1/wanted",
		tag: "Catalogue",
		summary: "Books neighbours are waiting for that nobody has listed",
		access: "catalogue:read",
		response: z.object({ works: z.array(WantedWork) }),
	},
	{
		method: "post",
		path: "/v1/wanted",
		tag: "Catalogue",
		summary: "Ask for a book nobody has listed; joins its waitlist",
		access: "loans:write",
		body: WantedRequest,
		response: WantedResponse,
		status: 201,
	},
	{
		method: "get",
		path: "/v1/works/:id/duplicates",
		tag: "Catalogue",
		summary: "Books here that may be the same as this one",
		access: "catalogue:read",
		response: z.object({ candidates: z.array(LookAlike) }),
	},
	{
		method: "post",
		path: "/v1/works/:id/merge",
		tag: "Catalogue",
		summary:
			"Fold this book into another that is the same; its copies, tags and queue move over",
		access: "shelf:write",
		body: z.object({
			into: Id,
			/** Keep this book's title rather than the other's. */
			keepTitle: z.boolean().optional(),
		}),
		response: z.object({ work: Id }),
		note: "For whoever owns every copy of it, or a moderator. Two books that share nothing need a moderator (409).",
	},
	{
		method: "post",
		path: "/v1/works/:id/distinct",
		tag: "Catalogue",
		summary:
			"Say two look-alike books are different, so they are not offered as one again",
		access: "shelf:write",
		body: z.object({ from: Id }),
		note: "For somebody with a copy of either, or a moderator.",
	},
	{
		method: "get",
		path: "/v1/me/tagging",
		tag: "Catalogue",
		summary: "The next of your books to tag, one at a time",
		access: "shelf:read",
		query: TAGGING_QUERY,
		response: TaggingStep,
	},
	{
		method: "get",
		path: "/v1/me/wishlist",
		tag: "Catalogue",
		summary: "Books you keep to read, on the shelves or not",
		access: "shelf:read",
		response: WishlistResponse,
	},
	{
		method: "put",
		path: "/v1/me/wishlist/:workId",
		tag: "Catalogue",
		summary: "Keep a book to read",
		access: "shelf:write",
	},
	{
		method: "delete",
		path: "/v1/me/wishlist/:workId",
		tag: "Catalogue",
		summary: "Stop keeping a book to read",
		access: "shelf:write",
	},
	{
		method: "put",
		path: "/v1/me/read/:workId",
		tag: "Catalogue",
		summary: "Mark a book read; listings leave it out unless asked",
		access: "shelf:write",
	},
	{
		method: "delete",
		path: "/v1/me/read/:workId",
		tag: "Catalogue",
		summary: "Mark a book not read",
		access: "shelf:write",
	},

	// Shelf
	{
		method: "get",
		path: "/v1/me/shelf",
		tag: "Shelf",
		summary: "Your copies",
		access: "shelf:read",
		response: z.object({ copies: z.array(ShelfCopy) }),
	},
	{
		method: "post",
		path: "/v1/copies",
		tag: "Shelf",
		summary: "List a copy you own",
		access: "shelf:write",
		body: AddCopyRequest,
		response: z.object({ id: Id, editionId: Id, workId: Id }),
		status: 201,
	},
	{
		method: "get",
		path: "/v1/copies/:id",
		tag: "Shelf",
		summary: "One of your copies, for editing",
		access: "shelf:read",
		response: CopyDetail,
	},
	{
		method: "patch",
		path: "/v1/copies/:id",
		tag: "Shelf",
		summary: "Edit a copy's condition, note, cover or lending policy",
		access: "shelf:write",
		body: UpdateCopy,
	},
	{
		method: "delete",
		path: "/v1/copies/:id",
		tag: "Shelf",
		summary: "Take a copy off the shelves",
		access: "shelf:write",
	},
	{
		method: "post",
		path: "/v1/covers",
		tag: "Shelf",
		summary:
			"Upload a cover image (multipart field `file`, JPEG/PNG/WebP, cropped client-side)",
		access: "shelf:write",
		multipart: true,
		response: CoverUploadResponse,
		status: 201,
	},
	{
		method: "post",
		path: "/v1/covers/from-url",
		tag: "Shelf",
		summary: "Fetch a cover from a public URL into the library's storage",
		access: "shelf:write",
		body: CoverFromUrl,
		response: CoverUploadResponse,
		status: 201,
	},
	{
		method: "get",
		path: "/v1/covers/:key",
		tag: "Shelf",
		summary: "A cover image the library keeps",
		access: "public",
		file: "image/*",
	},

	// Loans
	{
		method: "get",
		path: "/v1/me/loans",
		tag: "Loans",
		summary: "Loans you are borrowing, lending, passing on or waiting for",
		access: "loans:read",
		response: MyLoans,
	},
	{
		method: "post",
		path: "/v1/loans",
		tag: "Loans",
		summary: "Ask to borrow a copy (or to be next, when the holder may relay)",
		access: "loans:write",
		body: RequestLoan,
		response: z.object({ id: Id, status: LoanStatus, relay: z.boolean() }),
		status: 201,
	},
	{
		method: "post",
		path: "/v1/loans/:id/accept",
		tag: "Loans",
		summary: "Owner accepts a request",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/decline",
		tag: "Loans",
		summary: "Owner declines a request",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/cancel",
		tag: "Loans",
		summary: "Withdraw a request or an accepted loan before handoff",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/handed",
		tag: "Loans",
		summary: "Giver marks the book handed over",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/returned",
		tag: "Loans",
		summary: "Owner marks the book back on the shelf",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/extend",
		tag: "Loans",
		summary: "Push the due date back; borrowers only when nobody waits",
		access: "loans:write",
		body: ExtendLoan,
	},
	{
		method: "post",
		path: "/v1/loans/:id/nudge",
		tag: "Loans",
		summary: "Gentle reminder to the other party, once a day",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/report",
		tag: "Loans",
		summary: "Report damage, loss, a no-show or conduct to the moderators",
		access: "loans:write",
		body: FileReport,
		response: Created,
		status: 201,
	},

	// Messages
	{
		method: "get",
		path: "/v1/loans/:id/messages",
		tag: "Messages",
		summary: "The loan's conversation",
		access: "messages:read",
		response: LoanThread,
	},
	{
		method: "post",
		path: "/v1/loans/:id/messages",
		tag: "Messages",
		summary: "Post to the loan's conversation",
		access: "messages:write",
		body: PostMessage,
		response: ThreadMessage,
		status: 201,
	},
	{
		method: "post",
		path: "/v1/reports/:id/replies",
		tag: "Messages",
		summary: "Answer the moderators on a report you made",
		access: "messages:write",
		body: PostReportReply,
	},

	// Handoffs
	{
		method: "get",
		path: "/v1/me/availability",
		tag: "Handoffs",
		summary: "Your weekly availability grid",
		access: "profile:read",
		response: Availability,
	},
	{
		method: "put",
		path: "/v1/me/availability",
		tag: "Handoffs",
		summary: "Replace your availability grid",
		access: "loans:write",
		body: Availability,
	},
	{
		method: "get",
		path: "/v1/loans/:id/slots",
		tag: "Handoffs",
		summary: "Times both sides are free in the coming days",
		access: "loans:read",
		response: z.object({
			options: z.array(SlotOption),
			theirGridEmpty: z.boolean(),
		}),
	},
	{
		method: "get",
		path: "/v1/loans/:id/handoff",
		tag: "Handoffs",
		summary: "The current handoff, if any",
		access: "loans:read",
		response: z.object({ handoff: HandoffView.nullable() }),
	},
	{
		method: "post",
		path: "/v1/loans/:id/handoff/propose",
		tag: "Handoffs",
		summary: "Propose a day and period",
		access: "loans:write",
		body: ProposeHandoff,
		response: z.object({ id: Id, status: z.literal("proposed") }),
		status: 201,
	},
	{
		method: "post",
		path: "/v1/loans/:id/handoff/confirm",
		tag: "Handoffs",
		summary: "Agree to the proposed time; the meeting place is revealed",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/handoff/cancel",
		tag: "Handoffs",
		summary: "Call the proposed time off",
		access: "loans:write",
	},
	{
		method: "post",
		path: "/v1/loans/:id/handoff/complete",
		tag: "Handoffs",
		summary: "Confirm the handoff with the other side's code",
		access: "loans:write",
		body: CompleteHandoff,
	},

	// Waitlist
	{
		method: "get",
		path: "/v1/me/waitlist",
		tag: "Waitlist",
		summary: "Books you are waiting for",
		access: "loans:read",
		response: z.object({ entries: z.array(WaitlistEntry) }),
	},
	{
		method: "post",
		path: "/v1/waitlist",
		tag: "Waitlist",
		summary: "Wait for the next free copy of a work",
		access: "loans:write",
		body: JoinWaitlist,
		response: z.object({ id: Id, position: z.number().int().positive() }),
		status: 201,
	},
	{
		method: "delete",
		path: "/v1/waitlist/:id",
		tag: "Waitlist",
		summary: "Stop waiting",
		access: "loans:write",
	},

	// Profile
	{
		method: "get",
		path: "/v1/me",
		tag: "Profile",
		summary: "Who you are, your community and area",
		access: "profile:read",
		response: Me,
	},
	{
		method: "patch",
		path: "/v1/me",
		tag: "Profile",
		summary: "Update your name, language, area, lending limit or time away",
		access: "shelf:write",
		body: UpdateMe,
		note: "A token may change only the lending limit and the time away; the rest is the member's own, on the site.",
	},
	{
		method: "get",
		path: "/v1/me/stats",
		tag: "Profile",
		summary: "What my books have done: loans, readers, days out",
		access: "profile:read",
		response: MemberStats,
	},
	{
		method: "get",
		path: "/v1/me/tokens",
		tag: "Profile",
		summary: "Connected apps and personal tokens",
		access: "session",
		response: z.object({ tokens: z.array(TokenSummary) }),
	},
	{
		method: "post",
		path: "/v1/me/tokens",
		tag: "Profile",
		summary: "Create a personal token (shown once)",
		access: "session",
		body: CreateToken,
		response: TokenCreated,
		status: 201,
	},
	{
		method: "delete",
		path: "/v1/me/tokens/:id",
		tag: "Profile",
		summary: "Revoke a token",
		access: "session",
	},
	{
		method: "get",
		path: "/v1/me/invites",
		tag: "Profile",
		summary: "Invite links you made, and who joined by them",
		access: "profile:read",
		response: z.object({ invites: z.array(MyInvite) }),
	},
	{
		method: "post",
		path: "/v1/me/invites/:id/revoke",
		tag: "Profile",
		summary: "Withdraw an invite link nobody has used",
		access: "shelf:write",
	},
	{
		method: "post",
		path: "/v1/me/device-link",
		tag: "Profile",
		summary: "A sign-in link for another device, good for a few minutes",
		access: "session",
		response: z.object({ url: z.url(), expiresAt: Timestamp }),
		status: 201,
	},
	{
		method: "get",
		path: "/v1/push/key",
		tag: "Profile",
		summary: "The key a browser subscribes to notifications with",
		access: "public",
		response: z.object({ publicKey: z.string().nullable() }),
	},
	{
		method: "put",
		path: "/v1/me/push",
		tag: "Profile",
		summary: "Send notifications to this browser",
		access: "session",
		body: PushSubscription,
	},
	{
		method: "delete",
		path: "/v1/me/push",
		tag: "Profile",
		summary: "Stop notifications to a browser",
		access: "session",
		query: z.object({ endpoint: z.url() }),
	},
	{
		method: "post",
		path: "/v1/me/push/test",
		tag: "Profile",
		summary: "Send a test notification to a browser",
		access: "session",
		body: z.object({ endpoint: z.url() }),
		response: z.object({
			sent: z.number().int().nonnegative(),
			/** False when the library has no such subscription of yours. */
			known: z.boolean(),
		}),
	},
	{
		method: "get",
		path: "/v1/places",
		tag: "Profile",
		summary: "Places near the library by name or postcode, to set an area by",
		access: "member",
		query: z.object({ q: z.string() }),
		response: z.object({ places: z.array(Place) }),
	},
	{
		method: "get",
		path: "/v1/places/at",
		tag: "Profile",
		summary: "The name of the place at a point",
		access: "member",
		query: z.object({ lat: z.number(), lng: z.number() }),
		response: z.object({ name: z.string().nullable() }),
	},

	// Webhooks and events
	{
		method: "get",
		path: "/v1/events",
		tag: "Webhooks",
		summary: "Replay events you may see, oldest first from a cursor",
		access: "loans:read",
		query: EventsQuery,
		response: z.object({ events: z.array(EventView), next: Id.nullable() }),
	},
	{
		method: "get",
		path: "/v1/me/webhooks",
		tag: "Webhooks",
		summary: "Your subscriptions",
		access: "session",
		response: z.object({ webhooks: z.array(WebhookView) }),
	},
	{
		method: "post",
		path: "/v1/me/webhooks",
		tag: "Webhooks",
		summary: "Subscribe an HTTPS URL; the signing secret is returned once",
		access: "session",
		body: CreateWebhook,
		response: WebhookCreated,
		status: 201,
	},
	{
		method: "delete",
		path: "/v1/me/webhooks/:id",
		tag: "Webhooks",
		summary: "Remove a subscription",
		access: "session",
	},
	{
		method: "post",
		path: "/v1/me/webhooks/:id/test",
		tag: "Webhooks",
		summary: "Send a signed `ping` now",
		access: "session",
		status: 202,
		response: z.object({
			status: z.number().int().nullable(),
			ok: z.boolean(),
		}),
	},
	{
		method: "get",
		path: "/v1/me/webhooks/:id/deliveries",
		tag: "Webhooks",
		summary: "Recent deliveries and their outcomes",
		access: "session",
		response: z.object({ deliveries: z.array(DeliveryView) }),
	},

	// Auth (browser flow)
	{
		method: "post",
		path: "/v1/auth/magic-link",
		tag: "Auth",
		summary: "Email a sign-in link to a member or invitee",
		access: "public",
		body: MagicLinkRequest,
		response: MagicLinkResponse,
	},
	{
		method: "post",
		path: "/v1/auth/logout",
		tag: "Auth",
		summary: "End the session",
		access: "session",
	},
	{
		method: "post",
		path: "/v1/auth/exchange",
		tag: "Auth",
		summary: "Trade a sign-in link's token for a session",
		access: "public",
		body: ExchangeRequest,
		response: Session,
	},
	{
		method: "post",
		path: "/v1/auth/code",
		tag: "Auth",
		summary:
			"Trade the sign-in email's code for a session, from the browser that asked",
		access: "public",
		body: CodeRequest,
		response: Session,
	},
	{
		method: "post",
		path: "/v1/invites/state",
		tag: "Auth",
		summary: "What became of an invite link",
		access: "public",
		body: z.object({ token: z.string() }),
		response: z.object({ state: z.enum(["usable", "used", "expired"]) }),
	},
	{
		method: "post",
		path: "/v1/oauth/approve",
		tag: "Auth",
		summary:
			"Approve an assistant's connection; the code is traded for its token",
		access: "session",
		body: ApproveClient,
		response: ConsentCode,
		status: 201,
	},
	{
		method: "post",
		path: "/v1/invites",
		tag: "Auth",
		summary: "Invite a neighbour: a link that lets them join",
		access: "shelf:write",
		body: CreateInvite,
		note: "A member's link is for one person, for as long as the library sets, and they may have only as many open as it allows (409 beyond). A moderator's may be for a group, for up to 30 days.",
		response: Invite,
		status: 201,
	},

	// The library
	{
		method: "get",
		path: "/v1/community",
		tag: "Library",
		summary:
			"The library's name and words, what it lends, its languages and colour",
		access: "public",
		response: z.object({
			name: z.string(),
			type: LibraryType,
			languages: z.array(Locale),
			defaultLocale: Locale,
			texts: LibraryTexts,
			/** Everyone lives close by: no areas or distances anywhere. */
			compact: z.boolean(),
			/** The library's own colour, or null for the house green. */
			accent: z.string().nullable(),
		}),
	},
	{
		method: "post",
		path: "/v1/contact",
		tag: "Library",
		summary:
			"Write to the library's admin: feedback, a data request, a complaint",
		access: "public",
		body: ContactRequest,
		response: Created,
		status: 201,
		note: "Anyone may write, giving an address to answer on. Signed in, the member's own address is used; a token needs messages:write.",
	},

	// Moderator
	{
		method: "get",
		path: "/v1/admin/stats",
		tag: "Moderator",
		summary: "Community counts",
		access: "moderator",
		response: CommunityStats,
	},
	{
		method: "get",
		path: "/v1/admin/attention",
		tag: "Moderator",
		summary: "Open reports, overdue loans, unanswered requests",
		access: "moderator",
		response: z.object({ items: z.array(AttentionItem) }),
	},
	{
		method: "get",
		path: "/v1/admin/members",
		tag: "Moderator",
		summary: "Members and their roles",
		access: "moderator",
		response: z.object({ members: z.array(AdminMember) }),
	},
	{
		method: "post",
		path: "/v1/admin/members/:id/role",
		tag: "Moderator",
		summary: "Make or remove a moderator",
		access: "moderator",
		body: SetRole,
		note: "Roles are the library admin's to give and take; a moderator may only step down.",
	},
	{
		method: "post",
		path: "/v1/admin/members/:id/status",
		tag: "Moderator",
		summary: "Pause or reactivate a member",
		access: "moderator",
		body: SetStatus,
		note: "A moderator looks after members; suspending a moderator or the admin is the library admin's call.",
	},
	{
		method: "get",
		path: "/v1/admin/copies",
		tag: "Moderator",
		summary: "Every copy in the community",
		access: "moderator",
		response: z.object({ copies: z.array(AdminCopy) }),
	},
	{
		method: "post",
		path: "/v1/admin/copies/:id/retire",
		tag: "Moderator",
		summary: "Retire a copy",
		access: "moderator",
	},
	{
		method: "get",
		path: "/v1/admin/invites",
		tag: "Moderator",
		summary: "Open invites",
		access: "moderator",
		response: z.object({ invites: z.array(InviteSummary) }),
	},
	{
		method: "post",
		path: "/v1/admin/invites",
		tag: "Moderator",
		summary: "Create an invite link",
		access: "moderator",
		body: CreateInvite,
		response: Invite,
		status: 201,
	},
	{
		method: "post",
		path: "/v1/admin/invites/:id/revoke",
		tag: "Moderator",
		summary: "Revoke an invite",
		access: "moderator",
	},
	{
		method: "get",
		path: "/v1/admin/tag-proposals",
		tag: "Moderator",
		summary: "Tag suggestions, open first",
		access: "moderator",
		response: z.object({ proposals: z.array(TagProposal) }),
	},
	{
		method: "post",
		path: "/v1/admin/tag-proposals/:id/approve",
		tag: "Moderator",
		summary:
			"Approve a suggestion: settle its slug and both labels, then apply it to the book it came from",
		access: "moderator",
		body: ApproveTag,
		response: z.object({ tag: Tag }),
		status: 201,
	},
	{
		method: "post",
		path: "/v1/admin/tag-proposals/:id/decline",
		tag: "Moderator",
		summary: "Turn a suggestion down, with a word back",
		access: "moderator",
		body: DeclineTag,
	},
	{
		method: "patch",
		path: "/v1/admin/tags/:slug",
		tag: "Moderator",
		summary: "Rename or relabel a tag; books carrying it follow",
		access: "moderator",
		body: ApproveTag.partial(),
		response: z.object({ tag: Tag }),
	},
	{
		method: "get",
		path: "/v1/admin/reports",
		tag: "Moderator",
		summary: "Reports, open first",
		access: "moderator",
		response: z.object({ reports: z.array(ReportView) }),
	},
	{
		method: "post",
		path: "/v1/admin/reports/:id/resolve",
		tag: "Moderator",
		summary: "Close a report as handled",
		access: "moderator",
		body: CloseReport,
	},
	{
		method: "post",
		path: "/v1/admin/reports/:id/dismiss",
		tag: "Moderator",
		summary:
			"Close a report as not needed (a dismissed loss reshelves the copy)",
		access: "moderator",
		body: CloseReport,
	},
	{
		method: "get",
		path: "/v1/admin/reports/:id/thread",
		tag: "Moderator",
		summary: "A report and what was said about it",
		access: "moderator",
		response: ReportThread,
	},
	{
		method: "post",
		path: "/v1/admin/reports/:id/replies",
		tag: "Moderator",
		summary: "Answer the member who made a report",
		access: "moderator",
		body: PostReportReply,
	},
	{
		method: "get",
		path: "/v1/admin/members/:id",
		tag: "Moderator",
		summary: "One member: their role, loans, reports and invitations",
		access: "moderator",
		response: AdminMemberDetail,
	},
	{
		method: "post",
		path: "/v1/admin/members/:id/invites/revoke",
		tag: "Moderator",
		summary: "Withdraw every open invite link a member made",
		access: "library-admin",
		response: z.object({ revoked: z.number().int().nonnegative() }),
	},
	{
		method: "post",
		path: "/v1/admin/members/:id/export",
		tag: "Moderator",
		summary: "Everything the library holds about a member, for a data request",
		access: "library-admin",
		response: z.looseObject({}),
	},
	{
		method: "post",
		path: "/v1/admin/members/:id/erase",
		tag: "Moderator",
		summary:
			"Erase a member: their details, messages and listings go, their loans' history stays nameless",
		access: "library-admin",
		body: z.object({
			/** Their display name, typed again. */
			confirm: z.string(),
		}),
		response: z.object({
			erased: z.literal(true),
			/** How many messages of theirs went. */
			messages: z.number().int().nonnegative(),
		}),
		note: "Not the admin, nor oneself, nor a member with loans open (409).",
	},
	{
		method: "get",
		path: "/v1/admin/loans",
		tag: "Moderator",
		summary: "Loans, open first",
		access: "moderator",
		query: PAGE_QUERY.extend({
			status: z.literal("all").optional().meta({
				description: "Closed loans too; left out, only the open ones",
			}),
		}),
		response: AdminLoanPage,
	},
	{
		method: "post",
		path: "/v1/admin/loans/:id/close",
		tag: "Moderator",
		summary: "Settle an open loan that has a suspended member in it",
		access: "moderator",
		body: CloseLoan,
	},
	{
		method: "post",
		path: "/v1/admin/invites/email",
		tag: "Moderator",
		summary: "Email somebody an invitation",
		access: "moderator",
		body: EmailInvite,
		response: z.object({ id: Id, expiresAt: Timestamp }),
		status: 201,
		note: "502 when the email did not go: nothing was made, try again.",
	},
	{
		method: "get",
		path: "/v1/admin/duplicates",
		tag: "Moderator",
		summary: "Pairs of books here that may be the same",
		access: "moderator",
		response: z.object({
			pairs: z.array(z.object({ left: LookAlike, right: LookAlike })),
		}),
	},
	{
		method: "patch",
		path: "/v1/admin/works/:id",
		tag: "Moderator",
		summary: "Correct a book's own title, authors or cover",
		access: "moderator",
		body: EditWork,
		response: z.object({
			title: z.string(),
			authors: z.array(z.string()),
			note: z.string().nullable(),
		}),
	},
	{
		method: "get",
		path: "/v1/admin/tagging",
		tag: "Moderator",
		summary: "The next of the library's books to tag, one at a time",
		access: "moderator",
		query: TAGGING_QUERY,
		response: TaggingStep,
	},
	{
		method: "post",
		path: "/v1/admin/tags",
		tag: "Moderator",
		summary: "Add a tag to the vocabulary",
		access: "moderator",
		body: CreateTag,
		response: z.object({ tag: z.string() }),
		status: 201,
	},
	{
		method: "delete",
		path: "/v1/admin/tags/:slug",
		tag: "Moderator",
		summary: "Remove a tag; books carrying it lose it",
		access: "moderator",
		note: "409 for a tag the library sets itself, such as a language.",
	},
	{
		method: "patch",
		path: "/v1/admin/tag-namespaces/:id",
		tag: "Moderator",
		summary: "Rename a group of tags",
		access: "moderator",
		body: EditNamespace,
	},
	{
		method: "post",
		path: "/v1/admin/backup",
		tag: "Moderator",
		summary: "Take a backup now rather than tonight",
		access: "moderator",
		response: z.object({
			key: z.string(),
			tables: z.number().int().nonnegative(),
			rows: z.number().int().nonnegative(),
			bytes: z.number().int().nonnegative(),
		}),
		status: 201,
	},
	{
		method: "get",
		path: "/v1/admin/settings",
		tag: "Moderator",
		summary: "The library's settings",
		access: "library-admin",
		response: LibrarySettings,
	},
	{
		method: "patch",
		path: "/v1/admin/settings",
		tag: "Moderator",
		summary: "Change the library's settings; what is left out stays",
		access: "library-admin",
		body: LibrarySettings,
	},
	{
		method: "get",
		path: "/v1/admin/log",
		tag: "Moderator",
		summary: "What moderators did, newest first",
		access: "library-admin",
		query: PAGE_QUERY,
		response: LogPage,
	},
	{
		method: "get",
		path: "/v1/admin/contact",
		tag: "Moderator",
		summary: "Messages written to the library, unanswered first",
		access: "library-admin",
		query: PAGE_QUERY,
		response: ContactMessagePage,
	},
	{
		method: "post",
		path: "/v1/admin/contact/:id/handled",
		tag: "Moderator",
		summary: "Mark a message dealt with",
		access: "library-admin",
	},
	{
		method: "post",
		path: "/v1/admin/contact/:id/reopen",
		tag: "Moderator",
		summary: "Open a message again",
		access: "library-admin",
	},
];

export interface OpenApiOptions {
	/** Where `/v1/...` is reachable, e.g. `https://example.org/api`. */
	serverUrl: string;
	version?: string;
	/** The library's name, as the document's title. */
	title?: string;
}

/** Inline schemas: the `$schema` marker only belongs on a standalone document. */
function jsonSchema(schema: z.ZodType, io: "input" | "output") {
	const { $schema: _, ...rest } = z.toJSONSchema(schema, {
		io,
		unrepresentable: "any",
		target: "draft-2020-12",
	});
	return rest;
}

/** OpenAPI 3.1, built from ROUTES on every call (it is cheap and never stale). */
export function openapiDocument(
	options: OpenApiOptions,
): Record<string, unknown> {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const route of ROUTES) {
		const path = route.path.replace(/:([a-z]+)/gi, "{$1}");
		const parameters: unknown[] = [...route.path.matchAll(/:([a-z]+)/gi)].map(
			([, name]) => ({
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
			}),
		);
		if (route.query) {
			const shape = jsonSchema(route.query, "input") as {
				properties?: Record<string, unknown>;
				required?: string[];
			};
			for (const [name, schema] of Object.entries(shape.properties ?? {})) {
				parameters.push({
					name,
					in: "query",
					required: shape.required?.includes(name) ?? false,
					schema,
				});
			}
		}
		const responses: Record<string, unknown> = {
			[route.response || route.file ? String(route.status ?? 200) : "204"]:
				route.response
					? {
							description: "OK",
							content: {
								"application/json": {
									schema: jsonSchema(route.response, "output"),
								},
							},
						}
					: route.file
						? {
								description: "OK",
								content: {
									[route.file]: {
										schema: { type: "string", format: "binary" },
									},
								},
							}
						: { description: "Done" },
			"4XX": {
				description: "Problem",
				content: {
					"application/problem+json": { schema: jsonSchema(Problem, "output") },
				},
			},
		};
		const requestBody = route.multipart
			? {
					required: true,
					content: {
						"multipart/form-data": {
							schema: {
								type: "object",
								properties: { file: { type: "string", format: "binary" } },
								required: ["file"],
							},
						},
					},
				}
			: route.body
				? {
						required: true,
						content: {
							"application/json": { schema: jsonSchema(route.body, "input") },
						},
					}
				: undefined;
		paths[path] ??= {};
		paths[path][route.method] = {
			tags: [route.tag],
			summary: route.summary,
			operationId: operationId(route),
			...(parameters.length ? { parameters } : {}),
			...(requestBody ? { requestBody } : {}),
			responses,
			security: security(route.access),
			...(route.access === "session" ? { "x-session-only": true } : {}),
			...(description(route) ? { description: description(route) } : {}),
		};
	}

	return {
		openapi: "3.1.0",
		info: {
			title: options.title ?? "Neighbourhood library",
			version: options.version ?? "0.1.0",
			description:
				"Neighbours lending each other books. Every call the website makes is here; nothing is private to it. Errors are RFC 9457 problem documents. Timestamps are Unix seconds. Personal tokens come from /connect. Assistants connect to the MCP server instead, with OAuth; the tokens it hands them open the MCP server only, not this API.",
		},
		servers: [{ url: options.serverUrl }],
		tags: [
			"Catalogue",
			"Shelf",
			"Loans",
			"Messages",
			"Handoffs",
			"Waitlist",
			"Profile",
			"Webhooks",
			"Auth",
			"Library",
			"Moderator",
		].map((name) => ({ name })),
		paths,
		components: {
			securitySchemes: {
				bearer: {
					type: "http",
					scheme: "bearer",
					description:
						"A personal token or a session token, with the listed scope.",
				},
			},
		},
	};
}

function security(access: Access): unknown[] {
	if (access === "public") return [];
	const scope =
		access === "moderator" || access === "library-admin"
			? "admin"
			: access === "session" || access === "member"
				? null
				: access;
	return [{ bearer: scope ? [scope] : [] }];
}

/** Who may call, where the scope alone does not say, then the route's note. */
function description(route: Route): string | undefined {
	const who = {
		member: "Any signed-in member, whatever their token's scopes.",
		moderator: "Moderators only.",
		"library-admin": "The library's admin only.",
		session: "Browser sessions only: a personal token cannot call this.",
	}[route.access as string];
	return [who, route.note].filter(Boolean).join(" ") || undefined;
}

function operationId(route: Route): string {
	const words = route.path
		.replace(/^\/v1\//, "")
		.split("/")
		.filter((part) => part && !part.startsWith(":"))
		.map((part) => part.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()));
	return (
		route.method +
		words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join("")
	);
}
