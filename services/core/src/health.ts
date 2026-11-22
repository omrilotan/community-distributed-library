import type { Env } from "./env.ts";
import { allJobs } from "./jobs.ts";

type Status = "ok" | "failing";

export interface Health {
	ok: boolean;
	/** Each part the library needs, and whether it answers. */
	parts: Record<"database" | "images" | "notify" | "convo", Status>;
	/** Scheduled jobs with no good run for longer than they are allowed. */
	late: string[];
}

/**
 * Whether this library works: its database, its images bucket, the notify
 * and convo Workers, and its scheduled jobs (jobs.ts). Names and counts of
 * nothing but the parts, so it is safe to serve to anybody: the outside
 * probe (scripts/check-libraries.mjs --live) reads it.
 */
export async function health(env: Env): Promise<Health> {
	const answers = async (check: () => Promise<unknown>): Promise<Status> => {
		try {
			await check();
			return "ok";
		} catch {
			return "failing";
		}
	};
	const answered = async (fetcher: Fetcher): Promise<Status> =>
		answers(async () => {
			const response = await fetcher.fetch("http://internal/");
			await response.body?.cancel();
			if (!response.ok) throw new Error(String(response.status));
		});
	const [database, images, notify, convo, jobs] = await Promise.all([
		answers(() => env.DB.prepare("SELECT 1").first()),
		answers(() => env.COVERS.head("health")),
		answered(env.NOTIFY),
		answered(env.CONVO),
		allJobs(env).catch(() => null),
	]);
	const parts = { database, images, notify, convo };
	const late =
		jobs === null
			? ["unknown"]
			: jobs.filter((job) => job.late).map((job) => job.job);
	return {
		ok: Object.values(parts).every((part) => part === "ok") && !late.length,
		parts,
		late,
	};
}
