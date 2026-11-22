/**
 * What the Workers tell the operator: structured log events, and a record of
 * every scheduled job (docs/observability-plan.md, 1.2 and 1.3).
 *
 * Telemetry carries ids and counts only, never names, emails, places or
 * message text.
 */

export type Fields = Record<string, unknown>;

/** The Workers' console; this package is built without platform types. */
declare const console: {
	log(...values: unknown[]): void;
	warn(...values: unknown[]): void;
	error(...values: unknown[]): void;
};

/**
 * One JSON object per event, which Workers Logs indexes field by field:
 * `{ event, level, ...fields }`. Event names are `area.verb`.
 *
 * An error goes through console.error with the event as its message, so
 * Workers Issues groups failures by event and alerts once for each new one.
 * Set `key` in the fields to keep one Issue per thing (a job, a check)
 * rather than one for the whole event.
 */
export const log = {
	info(event: string, fields: Fields = {}): void {
		console.log({ event, level: "info", ...fields });
	},
	warn(event: string, fields: Fields = {}): void {
		console.warn({ event, level: "warn", ...fields });
	},
	error(event: string, fields: Fields = {}, error?: unknown): void {
		const message = fields.key === undefined ? event : `${event} ${fields.key}`;
		const record = { event, level: "error", ...fields };
		if (error === undefined) console.error(message, record);
		else console.error(message, record, error);
	},
};

/** As much of D1 as a job record needs, so this package needs no Workers types. */
interface Statement {
	bind(...values: unknown[]): Statement;
	run(): Promise<unknown>;
	all<T>(): Promise<{ results: T[] }>;
}
export interface JobDatabase {
	prepare(sql: string): Statement;
	batch(statements: Statement[]): Promise<unknown>;
}

/** A job's schedule: the longest it may go without a good run. */
export type JobSchedule = Record<string, number>;

const MINUTE = 60;
const HOUR = 3600;

/** Every-minute jobs miss after 10 minutes; daily ones after 26 hours. */
export const EVERY_MINUTE = 10 * MINUTE;
export const DAILY = 26 * HOUR;

const KEEP_RUNS = 30 * 24 * HOUR;
const seconds = () => Math.floor(Date.now() / 1000);

/**
 * Runs one scheduled job and records it: its row in job_status always, and a
 * row in job_runs when the run is worth keeping (a daily job, or any
 * failure). Logs `job.ran` or `job.failed`. Never throws, so one failing job
 * does not stop the others in the same cron.
 *
 * `quiet` jobs (the every-minute ones) log `job.ran` only when they did
 * something, as their result says.
 */
export async function runJob<T>(
	db: JobDatabase,
	job: string,
	work: () => Promise<T>,
	options: {
		quiet?: boolean;
		/** Told how the run went, to count it elsewhere (core's cdl_events). */
		onDone?: (outcome: "ok" | "failed", ms: number) => void;
	} = {},
): Promise<T | undefined> {
	const started = Date.now();
	const at = Math.floor(started / 1000);
	let outcome: "ok" | "failed" = "ok";
	let result: T | undefined;
	let failure: unknown;
	try {
		result = await work();
	} catch (error) {
		outcome = "failed";
		failure = error;
	}
	const ms = Date.now() - started;
	const detail = outcome === "ok" ? summary(result) : null;
	options.onDone?.(outcome, ms);
	if (outcome === "failed")
		log.error("job.failed", { key: job, job, ms }, failure);
	else if (!options.quiet || busy(result))
		log.info("job.ran", { job, ms, result: detail });

	const statements = [
		db
			.prepare(
				`INSERT INTO job_status (job, first_at, last_started_at, last_ok_at, last_failed_at, runs, failures)
				 VALUES (?1, ?2, ?2, ?3, ?4, 1, ?5)
				 ON CONFLICT(job) DO UPDATE SET
				   last_started_at = ?2,
				   last_ok_at = COALESCE(?3, last_ok_at),
				   last_failed_at = COALESCE(?4, last_failed_at),
				   runs = runs + 1,
				   failures = failures + ?5`,
			)
			.bind(
				job,
				at,
				outcome === "ok" ? at : null,
				outcome === "failed" ? at : null,
				outcome === "failed" ? 1 : 0,
			),
	];
	if (!options.quiet || outcome === "failed")
		statements.push(
			db
				.prepare(
					"INSERT INTO job_runs (job, started_at, finished_at, outcome, detail) VALUES (?, ?, ?, ?, ?)",
				)
				.bind(
					job,
					at,
					seconds(),
					outcome,
					detail === null ? null : JSON.stringify(detail),
				),
			db
				.prepare("DELETE FROM job_runs WHERE job = ? AND started_at < ?")
				.bind(job, at - KEEP_RUNS),
		);
	try {
		await db.batch(statements);
	} catch (error) {
		// The job ran; only its record is lost. Say so, but go on.
		log.error("job.unrecorded", { key: job, job }, error);
	}
	return result;
}

export interface JobState {
	job: string;
	firstAt: number;
	lastOkAt: number | null;
	lastFailedAt: number | null;
	runs: number;
	failures: number;
	/** No good run for longer than the schedule allows. */
	late: boolean;
}

/**
 * Each scheduled job's state, late or not. A job with no row yet is late
 * only once jobs have been recorded for longer than its schedule allows, so
 * a library that has just opened does not raise an alarm.
 */
export async function jobStates(
	db: JobDatabase,
	schedule: JobSchedule,
	at = seconds(),
): Promise<JobState[]> {
	const { results } = await db
		.prepare(
			"SELECT job, first_at, last_ok_at, last_failed_at, runs, failures FROM job_status",
		)
		.all<{
			job: string;
			first_at: number;
			last_ok_at: number | null;
			last_failed_at: number | null;
			runs: number;
			failures: number;
		}>();
	const since = Math.min(at, ...results.map((row) => row.first_at));
	return Object.entries(schedule).map(([job, allowed]) => {
		const row = results.find((entry) => entry.job === job);
		const from = row?.last_ok_at ?? row?.first_at ?? since;
		return {
			job,
			firstAt: row?.first_at ?? since,
			lastOkAt: row?.last_ok_at ?? null,
			lastFailedAt: row?.last_failed_at ?? null,
			runs: row?.runs ?? 0,
			failures: row?.failures ?? 0,
			late: at - from > allowed,
		};
	});
}

/** Logs each late job as an error, so Workers Issues alerts on it. */
export function reportLate(states: JobState[], where: string): void {
	for (const state of states.filter((entry) => entry.late))
		log.error("job.missed", {
			key: state.job,
			job: state.job,
			worker: where,
			lastOkAt: state.lastOkAt,
		});
}

/** A result small enough to log: numbers, short strings and flags only. */
function summary(result: unknown): Fields | number | null {
	if (typeof result === "number") return result;
	if (!result || typeof result !== "object") return null;
	const out: Fields = {};
	for (const [key, value] of Object.entries(result))
		if (
			typeof value === "number" ||
			typeof value === "boolean" ||
			(typeof value === "string" && value.length <= 80)
		)
			out[key] = value;
	return out;
}

/** Whether a quiet job's result says it did anything. */
function busy(result: unknown): boolean {
	if (typeof result === "number") return result > 0;
	if (!result || typeof result !== "object") return false;
	return Object.values(result).some(
		(value) => typeof value === "number" && value > 0,
	);
}
