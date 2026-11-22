import type { Env } from "./env.ts";

/**
 * Outcomes that leave nothing behind elsewhere, counted by the hour for the
 * checks (checks.ts). Counts only, never who.
 */
export type Tally = "sign_in_mail_failed" | "email_given_up" | "push_gone";

const KEEP_HOURS = 30 * 24;
const hourOf = (seconds: number) => Math.floor(seconds / 3600);

/** Adds `count` to this hour's tally. Never throws: counting is not the work. */
export async function tally(env: Env, name: Tally, count = 1): Promise<void> {
	if (count <= 0) return;
	const hour = hourOf(Date.now() / 1000);
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO tallies (name, hour, count) VALUES (?, ?, ?)
			 ON CONFLICT(name, hour) DO UPDATE SET count = count + excluded.count`,
		).bind(name, hour, count),
		env.DB.prepare("DELETE FROM tallies WHERE name = ? AND hour < ?").bind(
			name,
			hour - KEEP_HOURS,
		),
	]).catch(() => undefined);
}

/** A tally's total over the last `hours` hours, this one included. */
export async function tallied(
	env: Env,
	name: Tally,
	hours: number,
	at = Date.now() / 1000,
): Promise<number> {
	const row = await env.DB.prepare(
		"SELECT COALESCE(SUM(count), 0) AS n FROM tallies WHERE name = ? AND hour > ?",
	)
		.bind(name, hourOf(at) - hours)
		.first<{ n: number }>();
	return row?.n ?? 0;
}
