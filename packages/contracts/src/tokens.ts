import { z } from "zod";
import { Id, Timestamp } from "./primitives.ts";

/** OAuth and personal-token scopes. `admin` is moderators only. */
export const SCOPES = [
	"catalogue:read",
	"shelf:read",
	"shelf:write",
	"loans:read",
	"loans:write",
	"messages:read",
	"messages:write",
	"profile:read",
	"admin",
] as const;
export const Scope = z.enum(SCOPES);

export const SCOPE_DESCRIPTIONS: Record<
	(typeof SCOPES)[number],
	{ en: string; he: string }
> = {
	"catalogue:read": {
		en: "Browse and search the shelves",
		he: "עיון וחיפוש במדפים",
	},
	"shelf:read": { en: "See your items", he: "צפייה בפריטים שלך" },
	"shelf:write": {
		en: "Add and edit your items",
		he: "הוספה ועריכה של הפריטים שלך",
	},
	"loans:read": { en: "See your loans", he: "צפייה בהשאלות שלך" },
	"loans:write": {
		en: "Request items and answer requests",
		he: "בקשת פריטים ומענה לבקשות",
	},
	"messages:read": { en: "Read loan conversations", he: "קריאת שיחות השאלה" },
	"messages:write": {
		en: "Send messages on loans",
		he: "שליחת הודעות בהשאלות",
	},
	"profile:read": { en: "See your name and area", he: "צפייה בשם ובאזור שלך" },
	admin: { en: "Moderator actions", he: "פעולות מודרציה" },
};

/** The consent screen approving a client for a set of scopes. */
export const ApproveClient = z.object({
	clientName: z.string().trim().min(1).max(80),
	scopes: z.array(Scope).min(1),
});

/** Returned once: a one-time code the OAuth server redeems for the real token. */
export const ConsentCode = z.object({ code: z.string(), expiresAt: Timestamp });

/** A personal token for scripts; same shape as consent, minted without a client. */
export const CreateToken = ApproveClient;

/** Returned once; the plain token is never stored. */
export const TokenCreated = z.object({
	id: Id,
	token: z.string(),
	clientName: z.string(),
	scopes: z.array(Scope),
	expiresAt: Timestamp.nullable(),
});

export const TokenSummary = z.object({
	id: Id,
	clientName: z.string(),
	scopes: z.array(Scope),
	createdAt: Timestamp,
	lastUsedAt: Timestamp.nullable(),
	expiresAt: Timestamp.nullable(),
});

export type Scope = z.infer<typeof Scope>;
export type ApproveClient = z.input<typeof ApproveClient>;
export type ConsentCode = z.infer<typeof ConsentCode>;
export type TokenSummary = z.infer<typeof TokenSummary>;
export type CreateToken = z.input<typeof CreateToken>;
export type TokenCreated = z.infer<typeof TokenCreated>;
