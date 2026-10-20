import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";

export const Period = z.enum(["morning", "afternoon", "evening"]);
export const Weekday = z.number().int().min(0).max(6);
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AvailabilitySlot = z.object({ weekday: Weekday, period: Period });

/** A member's weekly availability plus where they meet. The place is private. */
export const Availability = z.object({
	slots: z.array(AvailabilitySlot).max(21),
	meetingPlace: z.string().trim().max(120).nullable(),
});

/** A concrete option for a loan: a day and a period both parties have open. */
export const SlotOption = z.object({
	day: Day,
	period: Period,
	both: z.boolean(),
	/** Which side has this slot free; both true means `both`. */
	mine: z.boolean().default(false),
	theirs: z.boolean().default(false),
});

/** What a party may pick from: every day of the window, and the free slots. */
export const SlotOptions = z.object({
	days: z.array(Day),
	options: z.array(SlotOption),
	myGridEmpty: z.boolean(),
	theirGridEmpty: z.boolean(),
	/** The host has no meeting place saved. */
	placeMissing: z.boolean().default(false),
});

export const ProposeHandoff = z.object({ day: Day, period: Period });
export const CompleteHandoff = z.object({
	code: z.string().trim().min(4).max(12),
});

/** The state of a loan's handoff as one party sees it. */
export const HandoffView = z.object({
	id: Id,
	direction: z.enum(["out", "back"]),
	day: Day,
	period: Period,
	status: z.enum(["proposed", "agreed", "completed", "cancelled"]),
	proposedByMe: z.boolean(),
	/** The lender's meeting place — borrower sees it only once agreed. */
	place: z.string().nullable(),
	/**
	 * The host has not saved a meeting place, so there is nothing to reveal:
	 * the host is asked to set one, the borrower to ask in the messages.
	 */
	placeMissing: z.boolean().default(false),
	/** The confirmation code — lender only, once agreed. */
	code: z.string().nullable(),
	agreedAt: Timestamp.nullable(),
});

export type Period = z.infer<typeof Period>;
export type AvailabilitySlot = z.infer<typeof AvailabilitySlot>;
export type Availability = z.infer<typeof Availability>;
export type SlotOption = z.infer<typeof SlotOption>;
export type SlotOptions = z.infer<typeof SlotOptions>;
export type ProposeHandoff = z.infer<typeof ProposeHandoff>;
export type CompleteHandoff = z.infer<typeof CompleteHandoff>;
export type HandoffView = z.infer<typeof HandoffView>;
