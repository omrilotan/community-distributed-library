import { env } from "cloudflare:test";
import { jobStates, runJob } from "@cdl/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../test/api.ts";
import { SCHEDULE } from "./jobs.ts";

const rows = (sql: string) =>
	env.DB.prepare(sql)
		.all<Record<string, unknown>>()
		.then((r) => r.results);

describe("a scheduled job", () => {
	afterEach(() => vi.restoreAllMocks());

	it("is recorded when it runs, and its daily runs are kept", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		await runJob(env.DB, "backup", async () => ({ rows: 3, key: "x.sql" }));
		expect(await rows("SELECT job, runs, failures FROM job_status")).toEqual([
			{ job: "backup", runs: 1, failures: 0 },
		]);
		const [run] = await rows("SELECT outcome, detail FROM job_runs");
		expect(run).toEqual({
			outcome: "ok",
			detail: JSON.stringify({ rows: 3, key: "x.sql" }),
		});
	});

	it("keeps only the failures of an every-minute job", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		await runJob(env.DB, "emails", async () => ({ sent: 0 }), { quiet: true });
		await runJob(
			env.DB,
			"emails",
			async () => {
				throw new Error("down");
			},
			{ quiet: true },
		);
		expect(await rows("SELECT job, runs, failures FROM job_status")).toEqual([
			{ job: "emails", runs: 2, failures: 1 },
		]);
		expect(await rows("SELECT outcome FROM job_runs")).toEqual([
			{ outcome: "failed" },
		]);
		// One Issue per job: the message names it.
		expect(errors.mock.calls[0]?.[0]).toBe("job.failed emails");
	});

	it("is late once it has gone longer than its schedule without a good run", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		await runJob(env.DB, "emails", async () => 0, { quiet: true });
		const at = Math.floor(Date.now() / 1000);
		const late = async (offset: number) =>
			(await jobStates(env.DB, SCHEDULE, at + offset))
				.filter((job) => job.late)
				.map((job) => job.job);
		expect(await late(60)).toEqual([]);
		// Every job that should have run in 11 minutes, and has not.
		expect(await late(11 * 60)).toEqual(["webhooks", "held-notices", "emails"]);
		// A library just opened: no job is late before any has had the chance.
		await env.DB.prepare("DELETE FROM job_status").run();
		expect(await late(30 * 3600)).toEqual([]);
	});
});

describe("the health route", () => {
	it("answers that every part works", async () => {
		const { status, body } = await api(null, "GET", "/v1/health");
		expect(status).toBe(200);
		expect(body).toEqual({
			ok: true,
			parts: { database: "ok", images: "ok", notify: "ok", convo: "ok" },
			late: [],
		});
	});

	it("answers 503 and names a job that stopped", async () => {
		const long = Math.floor(Date.now() / 1000) - 2 * 86_400;
		await env.DB.prepare(
			"INSERT INTO job_status (job, first_at, last_started_at, last_ok_at, runs) VALUES ('backup', ?1, ?1, ?1, 1)",
		)
			.bind(long)
			.run();
		const { status, body } = await api(null, "GET", "/v1/health");
		expect(status).toBe(503);
		expect(body.late).toContain("backup");
	});
});
