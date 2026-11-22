import { WorkerEntrypoint } from "cloudflare:workers";
import { reportLate, runJob } from "@cdl/contracts";
import { app } from "./app.ts";
import { backup } from "./backup.ts";
import { rehostCovers } from "./covers.ts";
import type { Env } from "./env.ts";
import { deliverPending } from "./events.ts";
import { runChecks } from "./checks.ts";
import { allJobs } from "./jobs.ts";
import { sendHeldNotices, sendPendingEmails } from "./notify.ts";
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
	/**
	 * Daily reminders (reminders.ts) and backups; and every minute, the loan
	 * requests whose owners are due to hear of them (notify.ts), webhook
	 * retries (events.ts) and the emails that follow an unopened push. Each
	 * job is recorded (jobs.ts), and every 15 minutes a job that has stopped
	 * running is reported.
	 */
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		const job = <T>(
			name: string,
			work: () => Promise<T>,
			options?: { quiet?: boolean },
		) => ctx.waitUntil(runJob(env.DB, name, work, options));
		if (event.cron === "0 8 * * *") job("reminders", () => runReminders(env));
		if (event.cron === "20 3 * * *") {
			job("backup", async () => (await backup(env)) ?? { skipped: true });
			// Connections nobody ever collected.
			job("revoke-consents", async () => ({
				revoked: await revokeAbandonedConsents(env),
			}));
			// Covers that still live on somebody else's server.
			job("rehost-covers", () => rehostCovers(env));
		}
		if (event.cron !== "* * * * *") return;
		const quiet = { quiet: true };
		job(
			"webhooks",
			async () => ({ delivered: await deliverPending(env) }),
			quiet,
		);
		// Requests made a few minutes ago and not taken back: now the owner hears.
		job("held-notices", () => sendHeldNotices(env), quiet);
		// The email that follows a push nobody picked up.
		job("emails", () => sendPendingEmails(env), quiet);
		const minute = new Date(event.scheduledTime).getUTCMinutes();
		if (minute % 15 === 0) {
			job("checks", async () => ({
				failing: (await runChecks(env)).filter((check) => !check.ok).length,
			}));
			ctx.waitUntil(allJobs(env).then((states) => reportLate(states, "core")));
		}
	},
};
