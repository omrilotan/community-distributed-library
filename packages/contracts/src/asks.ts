import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";
import { Day } from "./handoffs.ts";

/**
 * An ask: "does anyone have a saw I could borrow today?" It names a kind of
 * thing, not an item on a shelf, so any neighbour who has one may offer
 * theirs. The asker takes one offer, which becomes an accepted loan; the
 * rest are thanked. Nothing is put on anyone's shelf unless they choose it.
 */

/** How soon it is needed. Today's asks end with the day. */
export const ASK_BY = ["today", "week", "whenever"] as const;
export const AskBy = z.enum(ASK_BY);

/** How long an ask stays open, in days, by how soon it is needed. */
export const ASK_OPEN_DAYS: Record<(typeof ASK_BY)[number], number> = {
	today: 1,
	week: 7,
	whenever: 30,
};

/** How long it is wanted for, in days: a day, a weekend, a week. */
export const ASK_DAYS = [1, 3, 7] as const;

/** Asks one member may have open at once. */
export const ASK_LIMIT = 3;

/** Days an offer nobody took may still be kept on its owner's shelf. */
export const KEEP_PROMPT_DAYS = 7;

const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const CreateAsk = z.object({
	/** The kind of thing: "Saw". */
	what: z.string().trim().min(1).max(80),
	/** Anything to add: "hand saw or small chainsaw". */
	note: z.string().trim().max(200).optional(),
	by: AskBy,
	days: z
		.number()
		.int()
		.refine((days) => (ASK_DAYS as readonly number[]).includes(days)),
});

/**
 * When the asker may come by: now until a time, later today from a time, or
 * at the lender's usual times, which leaves the meeting to be arranged the
 * way any loan's is.
 */
export const OfferCome = z.enum(["now", "later", "usual"]);

export const CreateOffer = z
	.object({
		/** What theirs is: "Hand saw". */
		name: z.string().trim().min(1).max(80),
		come: OfferCome,
		/** Until when for `now`, from when for `later`. */
		time: ClockTime.optional(),
		note: z.string().trim().max(200).optional(),
		/** Where to come, from somebody who has not said yet. Saved as theirs. */
		meetingPlace: z.string().trim().min(1).max(120).optional(),
	})
	.refine((offer) => offer.come === "usual" || Boolean(offer.time), {
		message: "say what time",
	});

export const OfferStatus = z.enum(["offered", "taken", "passed", "withdrawn"]);

/** An offer, as the asker or the one who made it sees it. */
export const OfferView = z.object({
	id: Id,
	name: z.string(),
	come: OfferCome,
	time: z.string().nullable(),
	/** The day `now` or `later` was said on; they hold for that day alone. */
	day: Day,
	note: z.string().nullable(),
	status: OfferStatus,
	by: z.object({ id: Id, displayName: z.string() }),
	/** The loan it became, once taken. */
	loanId: Id.nullable(),
});

export const AskStatus = z.enum(["open", "taken", "closed"]);

export const AskView = z.object({
	id: Id,
	what: z.string(),
	note: z.string().nullable(),
	by: AskBy,
	days: z.number().int().positive(),
	/** Closed covers an ask that ran out of time as well as one its asker closed. */
	status: AskStatus,
	createdAt: Timestamp,
	expiresAt: Timestamp,
	asker: z.object({ id: Id, displayName: z.string() }),
	mine: z.boolean(),
	/** How many neighbours have offered; the offers themselves are the asker's to see. */
	offerCount: z.number().int().nonnegative(),
	/** The viewer's own offer on it, if they made one. */
	myOffer: OfferView.nullable(),
	/** Every open offer: the asker only. */
	offers: z.array(OfferView),
});

/** One ask, with what the offer form needs to know about the viewer. */
export const AskDetail = AskView.extend({
	/** The viewer has not said where they hand things over. */
	placeMissing: z.boolean(),
	/** The viewer has weekly times saved. */
	hasUsualTimes: z.boolean(),
});

export const AsksList = z.object({ asks: z.array(AskView) });

/** "Keep it on your shelf?": asked once, after the loan or when another offer was taken. */
export const KeepPrompt = z.object({
	offerId: Id,
	name: z.string(),
	/** Lent and back, or never taken. */
	after: z.enum(["returned", "passed"]),
	askerName: z.string(),
	what: z.string(),
});

/** What the loans page shows of asks: mine, my offers still waiting, and what to decide. */
export const MyAsks = z.object({
	asks: z.array(AskView),
	offers: z.array(
		z.object({
			offer: OfferView,
			ask: AskView.pick({
				id: true,
				what: true,
				by: true,
				days: true,
				asker: true,
			}),
		}),
	),
	keep: z.array(KeepPrompt),
});

export const TakeOfferResponse = z.object({ loanId: Id });
export const KeepAnswer = z.object({ keep: z.boolean() });
export const KeepResponse = z.object({
	/** The item now on the shelf, when kept. */
	copyId: Id.nullable(),
	workId: Id.nullable(),
});

/** What a loan that began as an ask carries of its offer, for the loan page. */
export const LoanAsk = z.object({
	what: z.string(),
	come: OfferCome,
	time: z.string().nullable(),
	day: Day,
	note: z.string().nullable(),
});

export type AskBy = z.infer<typeof AskBy>;
export type CreateAsk = z.input<typeof CreateAsk>;
export type CreateOffer = z.input<typeof CreateOffer>;
export type OfferCome = z.infer<typeof OfferCome>;
export type OfferStatus = z.infer<typeof OfferStatus>;
export type OfferView = z.infer<typeof OfferView>;
export type AskStatus = z.infer<typeof AskStatus>;
export type AskView = z.infer<typeof AskView>;
export type AskDetail = z.infer<typeof AskDetail>;
export type AsksList = z.infer<typeof AsksList>;
export type KeepPrompt = z.infer<typeof KeepPrompt>;
export type MyAsks = z.infer<typeof MyAsks>;
export type LoanAsk = z.infer<typeof LoanAsk>;
