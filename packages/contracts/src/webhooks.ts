import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";

/** What core publishes. `ping` is only ever sent by a test. */
export const EVENT_KINDS = [
	"copy.listed",
	"copy.retired",
	"copy.state_changed",
	"loan.requested",
	"loan.accepted",
	"handoff.scheduled",
	"handoff.confirmed",
	"loan.closed",
] as const;
export const EventKind = z.enum(EVENT_KINDS);

/** An event as delivered and as replayed. `data` carries ids only. */
export const EventView = z.object({
	id: Id,
	kind: z.string(),
	data: z.record(z.string(), z.unknown()),
	createdAt: Timestamp,
});

export const CreateWebhook = z.object({
	url: z.url().max(500),
	/** Empty means every kind. */
	kinds: z.array(EventKind).default([]),
});

export const WebhookView = z.object({
	id: Id,
	url: z.string(),
	kinds: z.array(EventKind),
	createdAt: Timestamp,
	disabledAt: Timestamp.nullable(),
	failures: z.number().int().nonnegative(),
	lastStatus: z.number().int().nullable(),
	lastAt: Timestamp.nullable(),
});

/** The secret appears once, here. */
export const WebhookCreated = WebhookView.extend({ secret: z.string() });

export const DeliveryView = z.object({
	id: Id,
	eventId: Id,
	kind: z.string(),
	status: z.enum(["pending", "delivered", "failed"]),
	attempts: z.number().int().nonnegative(),
	nextAt: Timestamp,
	lastStatus: z.number().int().nullable(),
	lastError: z.string().nullable(),
	createdAt: Timestamp,
});

export const EventsQuery = z.object({
	/** An event id; only newer events come back. */
	since: z.string().optional(),
	limit: z.number().int().positive().max(200).default(50),
});

export type EventKind = z.infer<typeof EventKind>;
export type EventView = z.infer<typeof EventView>;
export type CreateWebhook = z.input<typeof CreateWebhook>;
export type WebhookView = z.infer<typeof WebhookView>;
export type WebhookCreated = z.infer<typeof WebhookCreated>;
export type DeliveryView = z.infer<typeof DeliveryView>;
