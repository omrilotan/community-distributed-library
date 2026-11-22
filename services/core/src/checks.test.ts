import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_A, DANA, SAM } from "../test/api.ts";
import { CHECKS, runChecks } from "./checks.ts";
import { tally } from "./tallies.ts";

const at = () => Math.floor(Date.now() / 1000);
const failing = async (time = at()) =>
	(await runChecks(env, time))
		.filter((check) => !check.ok)
		.map((check) => check.name);

const today = () => `d1/${new Date().toISOString().slice(0, 10)}.sql`;

describe("the checks", () => {
	// Last night's snapshot is there, as it would be.
	beforeEach(() => env.BACKUPS!.put(today(), "-- snapshot"));
	afterEach(async () => {
		vi.restoreAllMocks();
		await env.BACKUPS!.delete(today());
	});

	it("all pass on a library that is as it should be", async () => {
		expect(await failing()).toEqual([]);
		const { results } = await env.DB.prepare(
			"SELECT name FROM check_results ORDER BY name",
		).all<{ name: string }>();
		expect(results.map((row) => row.name)).toEqual(
			CHECKS.map((check) => check.name).sort(),
		);
	});

	it("alert when sign-in emails fail, once per check", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		await tally(env, "sign_in_mail_failed");
		expect(await failing()).toEqual(["sign_in_mail_failing"]);
		expect(errors.mock.calls.map((call) => call[0])).toEqual([
			"check.failed sign_in_mail_failing",
		]);
	});

	it("say an email is stuck only on the second run in a row", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await env.DB.prepare(
			`INSERT INTO pending_emails (id, member_id, message, created_at, send_after)
			 VALUES ('stuck', ?, '{}', 1, ?)`,
		)
			.bind(SAM, at() - 3600)
			.run();
		expect(await failing()).toEqual([]);
		expect(await failing()).toEqual(["emails_stuck"]);
	});

	it("find a copy on loan with no loan", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await env.DB.prepare(
			"UPDATE copies SET state = 'on_loan', holder_id = ? WHERE id = ?",
		)
			.bind(SAM, COPY_A)
			.run();
		expect(await failing()).toEqual(["copy_loan_mismatch"]);
		const row = await env.DB.prepare(
			"SELECT value, failing_since FROM check_results WHERE name = 'copy_loan_mismatch'",
		).first<{ value: number; failing_since: number }>();
		expect(row?.value).toBe(1);
		expect(row?.failing_since).toBeGreaterThan(0);
	});

	it("find a loan agreed two weeks ago with no handover", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await env.DB.prepare(
			`INSERT INTO loans (id, copy_id, borrower_id, lender_id, community_id, status, requested_at, decided_at)
			 VALUES ('old', ?, ?, ?, '01J0COMMUNITY0000000FINCH', 'accepted', 1, ?)`,
		)
			.bind(COPY_A, SAM, DANA, at() - 15 * 86_400)
			.run();
		expect(await failing()).toEqual(["loan_no_handoff"]);
	});

	it("alert when last night's snapshot is missing", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await env.BACKUPS!.delete(today());
		// Before 04:00 UTC, yesterday's would do; take noon to be sure.
		const noon = new Date();
		noon.setUTCHours(12, 0, 0, 0);
		expect(await failing(Math.floor(noon.getTime() / 1000))).toEqual([
			"backup_missing",
		]);
	});
});
