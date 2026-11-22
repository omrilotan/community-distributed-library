import {
	DAILY,
	EVERY_MINUTE,
	jobStates,
	type JobState,
	type JobSchedule,
} from "@cdl/contracts";
import type { Env } from "./env.ts";

/**
 * Core's scheduled jobs and the longest each may go without a good run
 * (docs/observability-plan.md, 1.3). The names are what job_status and the
 * logs call them.
 */
export const SCHEDULE: JobSchedule = {
	webhooks: EVERY_MINUTE,
	"held-notices": EVERY_MINUTE,
	emails: EVERY_MINUTE,
	reminders: DAILY,
	backup: DAILY,
	"revoke-consents": DAILY,
	"rehost-covers": DAILY,
	snapshot: DAILY,
	// Every 15 minutes (checks.ts).
	checks: 40 * 60,
};

/** Every job of this library, core's and convo's, each with where it runs. */
export async function allJobs(
	env: Env,
): Promise<(JobState & { worker: string })[]> {
	const ours = (await jobStates(env.DB, SCHEDULE)).map((state) => ({
		...state,
		worker: "core",
	}));
	// Convo keeps its own; an older convo without the call has none to give.
	const theirs = await env.CONVO.jobs().catch(() => []);
	return [...ours, ...theirs.map((state) => ({ ...state, worker: "convo" }))];
}
