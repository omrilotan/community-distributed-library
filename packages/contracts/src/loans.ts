import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";
import { Condition, CopyListing, ListingSort, WorkListing } from "./copies.ts";
import { Edition, Work } from "./catalogue.ts";

/**
 * Minutes a new loan request waits before its owner hears of it: until then
 * the asker can take it back and nobody is told.
 */
export const REQUEST_HOLD_MINUTES = 5;

export const LoanStatus = z.enum([
	"requested",
	"accepted",
	"declined",
	"active",
	"completed",
	"cancelled",
	"lost",
]);

export const RequestLoan = z.object({
	copyId: Id,
	/** A line to the lender: when you could collect, why this book. Optional. */
	message: z.string().trim().max(280).optional(),
	/** Of a set, how many: six of the twelve chairs. Anything else is lent whole. */
	quantity: z.number().int().min(1).max(500).default(1),
});

/** A loan as either party sees it: the counterparty reduced to a name and area label. */
export const LoanView = z.object({
	id: Id,
	/** Messages and moderators' replies the viewer has not seen yet. */
	unread: z.number().int().nonnegative().default(0),
	status: LoanStatus,
	message: z.string().nullable(),
	requestedAt: Timestamp,
	decidedAt: Timestamp.nullable(),
	/** Set when the book changes hands; the timer starts here. */
	startedAt: Timestamp.nullable(),
	dueAt: Timestamp.nullable(),
	closedAt: Timestamp.nullable(),
	/** How many of the set this loan is for; 1 for anything lent whole. */
	quantity: z.number().int().positive().default(1),
	/** Seconds until this side may nudge again; 0 means now. */
	nudgeCooldown: z.number().int().nonnegative(),
	/** How many times the due date was pushed back. */
	extensions: z.number().int().nonnegative(),
	/** Someone is on the waitlist for this work: extensions need the owner. */
	someoneWaiting: z.boolean(),
	/**
	 * Accepted over a day ago and still no time put forward to hand it over;
	 * set only for the two people who meet.
	 */
	needsTime: z.boolean().default(false),
	copy: z.object({
		id: Id,
		/** The book's own page. */
		workId: Id,
		title: z.string(),
		authors: z.array(z.string()),
		coverUrl: z.string().nullable(),
		condition: Condition,
		/** The size of the set: 12, of which this loan is `quantity`. */
		quantity: z.number().int().positive().default(1),
	}),
	borrower: z.object({
		id: Id,
		displayName: z.string(),
		areaLabel: z.string().nullable(),
		/** Suspended by the moderators: not to be messaged or nudged; they handle it. */
		suspended: z.boolean().default(false),
	}),
	lender: z.object({
		id: Id,
		displayName: z.string(),
		areaLabel: z.string().nullable(),
		suspended: z.boolean().default(false),
	}),
	/** Set on a relay: the current holder who will hand the book over instead of the owner. */
	relayFrom: z
		.object({
			id: Id,
			displayName: z.string(),
			suspended: z.boolean().default(false),
		})
		.nullable(),
});

export const MyLoans = z.object({
	borrowing: z.array(LoanView),
	lending: z.array(LoanView),
	/** Relays I am handing over as the current holder. */
	relaying: z.array(LoanView),
});

/** The storefront: available copies, newest first, no query needed. */
export const BrowseRequest = z.object({
	/** Radius in metres. None unless the member asks: the whole library is in reach. */
	within: z.number().int().positive().max(20_000).optional(),
	/**
	 * One member's shelf, as seen from a book page. Any id is accepted: this
	 * narrows a listing rather than fetching a member, so an id nobody holds
	 * is an empty shelf, not an error.
	 */
	owner: z.string().min(1).max(64).optional(),
	/** Up to ten pages, so "more" can be reopened from a link or the Back button. */
	limit: z.number().int().positive().max(240).default(24),
	offset: z.number().int().nonnegative().default(0),
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

/**
 * The books a member wants to read: those with copies here, as browse shows
 * them, and those nobody here has any more.
 */
export const WishlistResponse = z.object({
	results: z.array(WorkListing),
	withoutCopies: z.array(
		z.object({ id: Id, title: z.string(), authors: z.array(z.string()) }),
	),
});

export const BrowseResponse = z.object({
	results: z.array(WorkListing),
	/** How many books match in all, whatever this page holds. */
	total: z.number().int().nonnegative(),
	nextOffset: z.number().int().nonnegative().nullable(),
});

/** A book page: the work, its editions, and every copy the viewer may request. */
export const WorkPage = z.object({
	work: Work,
	editions: z.array(Edition),
	copies: z.array(
		CopyListing.extend({
			/** True for the viewer's own copies — shown, not requestable. */
			mine: z.boolean(),
			/** The viewer's open request on this copy, if any. */
			myLoanId: Id.nullable(),
			/** Where that request stands: asked, agreed, or with the viewer. */
			myLoanStatus: z
				.enum(["requested", "accepted", "active"])
				.nullable()
				.default(null),
			/** When it is due back, once it is with the viewer. */
			myLoanDue: Timestamp.nullable().default(null),
			/** On loan with relay allowed: the viewer may ask to be next. */
			relayable: z.boolean(),
			/** Someone else on the waitlist has first dibs until then. */
			heldUntil: Timestamp.nullable(),
			/** Held for the viewer, from the waitlist, until then: theirs to ask for. */
			heldForMe: Timestamp.nullable().default(null),
		}),
	),
	/** The viewer's place in the queue for this work, if any. */
	myWaitlist: z
		.object({ id: Id, position: z.number().int().positive() })
		.nullable(),
	/** The viewer marked this book as read. */
	read: z.boolean(),
	/** The book is on the viewer's wishlist. */
	wished: z.boolean(),
});

export type LoanStatus = z.infer<typeof LoanStatus>;
export type RequestLoan = z.input<typeof RequestLoan>;
export type LoanView = z.infer<typeof LoanView>;
export type MyLoans = z.infer<typeof MyLoans>;
export type BrowseRequest = z.input<typeof BrowseRequest>;
export type BrowseResponse = z.infer<typeof BrowseResponse>;
export type WishlistResponse = z.infer<typeof WishlistResponse>;
export type WorkPage = z.infer<typeof WorkPage>;
