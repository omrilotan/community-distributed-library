import {
	createExecutionContext,
	createScheduledController,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { activeLoan, as, COPY_B, DANA, SAM } from "../test/api.ts";
import worker from "./index.ts";
import { runReminders } from "./reminders.ts";

const DAY = 86_400;

/** The reminders and digests notify was asked to send since `from`. */
async function sentSince(from: number) {
	const all = await (
		env.NOTIFY as unknown as {
			sentMessages(): Promise<{ kind: string; stage?: string; to: string }[]>;
		}
	).sentMessages();
	return all
		.slice(from)
		.filter((message) =>
			["loan_reminder", "librarian_digest"].includes(message.kind),
		)
		.map((message) => `${message.kind}:${message.stage ?? ""}:${message.to}`)
		.sort();
}
const sentCount = async () =>
	(
		await (
			env.NOTIFY as unknown as { sentMessages(): Promise<unknown[]> }
		).sentMessages()
	).length;

const setLoan = (id: string, sql: string) =>
	env.DB.prepare(`UPDATE loans SET ${sql} WHERE id = ?`).bind(id).run();

describe("the daily reminders", () => {
	it("tell each stage once, however many times the pass runs", async () => {
		const overdue = await activeLoan(SAM, DANA, COPY_B);
		await setLoan(overdue, `due_at = unixepoch() - ${15 * DAY}`);
		const before = await sentCount();

		await runReminders(env);
		expect(await sentSince(before)).toEqual([
			"librarian_digest::dana@example.com",
			"loan_reminder:overdue:sam@example.com",
		]);
		const after = await sentCount();
		await runReminders(env);
		expect(await sentCount()).toBe(after);
	});

	it("two passes at once still tell once", async () => {
		const id = (await as(SAM).post("/v1/loans", { copyId: COPY_B })).body.id;
		await setLoan(id, `requested_at = unixepoch() - ${3 * DAY}`);
		const before = await sentCount();
		await Promise.all([runReminders(env), runReminders(env)]);
		expect(await sentSince(before)).toEqual([
			"loan_reminder:unanswered:dana@example.com",
		]);
	});

	it("an extended loan that runs late again goes to the moderators again", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		await setLoan(id, `due_at = unixepoch() - ${15 * DAY}`);
		await runReminders(env);
		expect(
			(await as(DANA).post(`/v1/loans/${id}/extend`, { days: 7 })).status,
		).toBe(204);
		// Weeks later it is long overdue once more.
		await setLoan(id, `due_at = unixepoch() - ${15 * DAY}`);
		const before = await sentCount();
		await runReminders(env);
		expect(await sentSince(before)).toContain(
			"librarian_digest::dana@example.com",
		);
	});

	it("run from the 08:00 cron", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		await setLoan(id, `due_at = unixepoch() + ${DAY}`);
		const before = await sentCount();
		const ctx = createExecutionContext();
		await worker.scheduled(
			createScheduledController({
				cron: "0 8 * * *",
				scheduledTime: Date.now(),
			}) as unknown as ScheduledEvent,
			env as never,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		expect(await sentSince(before)).toContain(
			"loan_reminder:due_soon:sam@example.com",
		);
	});
});

describe("the daily housekeeping", () => {
	it("forgets spent sign-in links, ended sessions and uncollected tokens", async () => {
		const at = Math.floor(Date.now() / 1000);
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO magic_links (id, email, token_hash, expires_at, created_at) VALUES
				 ('ml-old', 'zed@example.com', 'h-old', ?1, ?1), ('ml-new', 'zed@example.com', 'h-new', ?2, ?2)`,
			).bind(at - 3 * DAY, at + 600),
			env.DB.prepare(
				`INSERT INTO sessions (id, member_id, token_hash, created_at, expires_at, last_seen_at, revoked_at) VALUES
				 ('s-old', ?1, 's-h-old', 1, ?2, 1, ?3), ('s-live', ?1, 's-h-live', ?2, ?4, ?2, NULL)`,
			).bind(SAM, at - 60 * DAY, at - 40 * DAY, at + 60 * DAY),
			env.DB.prepare(
				`INSERT INTO pending_emails (id, member_id, message, created_at, send_after)
				 VALUES ('pe-old', ?, '{}', ?, ?)`,
			).bind(SAM, at - 2 * DAY, at + 10 * DAY),
		]);
		const { forgetSpent } = await import("./reminders.ts");
		await forgetSpent(env, at);
		const left = await env.DB.batch(
			[
				"SELECT id FROM magic_links WHERE email = 'zed@example.com'",
				`SELECT id FROM sessions WHERE id IN ('s-old', 's-live')`,
				"SELECT id FROM pending_emails WHERE id = 'pe-old'",
			].map((sql) => env.DB.prepare(sql)),
		);
		expect(
			left.map((result) =>
				result.results.map((row) => (row as { id: string }).id),
			),
		).toEqual([["ml-new"], ["s-live"], []]);
	});
});
