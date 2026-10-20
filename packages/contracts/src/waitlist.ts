import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";

export const JoinWaitlist = z.object({ workId: Id });

export const WaitlistEntry = z.object({
	id: Id,
	workId: Id,
	title: z.string(),
	authors: z.array(z.string()),
	coverUrl: z.string().nullable(),
	position: z.number().int().positive(),
	createdAt: Timestamp,
	/** A copy is being held for me until this time. */
	offer: z.object({ copyId: Id, expiresAt: Timestamp }).nullable(),
});

export type JoinWaitlist = z.infer<typeof JoinWaitlist>;
export type WaitlistEntry = z.infer<typeof WaitlistEntry>;
