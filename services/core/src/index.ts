import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app.ts";
import { backup } from "./backup.ts";
import { rehostCovers } from "./covers.ts";
import type { Env } from "./env.ts";
import { deliverPending } from "./events.ts";
import { sendPendingEmails } from "./notify.ts";
import { runReminders } from "./reminders.ts";
import { redeemConsent, revokeAbandonedConsents } from "./tokens-store.ts";

/**
 * Private RPC for sibling workers. Only reachable over a service binding with
 * `entrypoint: "Internal"` — never from the public API.
 */
export class Internal extends WorkerEntrypoint<Env> {
	/** The OAuth server trades a consent code for the member's scoped token. */
	redeemConsent(code: string) {
		return redeemConsent(this.env, code);
	}
}

export default {
	fetch: app.fetch,
	/** Daily reminders (reminders.ts) and, every 15 minutes, webhook retries (events.ts). */
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		if (event.cron === "0 8 * * *") {
			ctx.waitUntil(
				runReminders(env)
					.then((result) => console.log("[reminders]", JSON.stringify(result)))
					.catch((error: unknown) =>
						console.error("[reminders] failed", error),
					),
			);
		}
		if (event.cron === "20 3 * * *") {
			ctx.waitUntil(
				backup(env)
					.then((result) => console.log("[backup]", JSON.stringify(result)))
					.catch((error: unknown) => console.error("[backup] failed", error)),
			);
			// Connections nobody ever collected.
			ctx.waitUntil(
				revokeAbandonedConsents(env)
					.then((n) => {
						if (n) console.log("[tokens] revoked abandoned consents", n);
					})
					.catch((error: unknown) => console.error("[tokens] failed", error)),
			);
			// Covers that still live on somebody else's server.
			ctx.waitUntil(
				rehostCovers(env)
					.then((result) => {
						if (result.taken || result.failed)
							console.log("[covers]", JSON.stringify(result));
					})
					.catch((error: unknown) => console.error("[covers] failed", error)),
			);
		}
		ctx.waitUntil(
			deliverPending(env)
				.then((sent) => {
					if (sent) console.log("[webhooks] delivered", sent);
				})
				.catch((error: unknown) => console.error("[webhooks] failed", error)),
		);
		// The email that follows a push nobody picked up.
		ctx.waitUntil(
			sendPendingEmails(env)
				.then((result) => {
					if (result.sent || result.dropped)
						console.log("[notify]", JSON.stringify(result));
				})
				.catch((error: unknown) => console.error("[notify] failed", error)),
		);
	},
};
