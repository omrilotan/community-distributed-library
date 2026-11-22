import { describe, expect, it, vi } from "vitest";
import { digest } from "./digest.ts";
import type { Env, LibraryStatus } from "./env.ts";
import worker, { answer } from "./index.ts";
import { runbookFor } from "./tools.ts";

/** A database that holds nothing, and remembers what it was asked to keep. */
function emptyDb() {
	const kept: unknown[][] = [];
	const statement = (sql: string) => {
		let values: unknown[] = [];
		const self = {
			bind: (...given: unknown[]) => ((values = given), self),
			all: async () => ({ results: [] }),
			first: async () => null,
			run: async () => (kept.push([sql, ...values]), {}),
			sql,
			get values() {
				return values;
			},
		};
		return self;
	};
	return {
		kept,
		prepare: statement,
		batch: async (list: ReturnType<typeof statement>[]) => {
			for (const one of list) kept.push([one.sql, ...one.values]);
			return [];
		},
	};
}

const healthy: LibraryStatus = {
	library: "our-street",
	deployedAt: 1,
	ok: true,
	parts: { database: "ok", images: "ok", notify: "ok", convo: "ok" },
	late: [],
	checks: [
		{
			name: "emails_stuck",
			value: 0,
			previous_value: 0,
			severity: "critical",
			checked_at: 1,
			failing_since: null,
		},
	],
	jobs: [],
	queues: { emailsOverdue: 0, noticesOverdue: 0 },
};

function env(status: LibraryStatus = healthy) {
	const db = emptyDb();
	const library = {
		opsStatus: vi.fn(async () => status),
		opsRunCheck: vi.fn(async () => []),
		opsAdmins: vi.fn(async () => ["dana@example.com"]),
	};
	return {
		db,
		library,
		env: {
			DB: db,
			LIBRARIES: JSON.stringify([
				{
					slug: "our-street",
					host: "our-street.example.org",
					binding: "LIBRARY_OUR_STREET",
					sampling: {},
				},
			]),
			FROM_ADDRESS: "our-street@example.org",
			OPS_TOKEN: "the operator's key",
			ALERTS_SECRET: "the webhook's key",
			LIBRARY_OUR_STREET: library,
		} as unknown as Env,
	};
}

const call = (e: Env, name: string, args: Record<string, unknown> = {}) =>
	answer(e, {
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: { name, arguments: args },
	}) as Promise<{
		result: { content: { text: string }[]; isError?: boolean };
	}>;

describe("the ops MCP", () => {
	it("lets in the operator's key only", async () => {
		const { env: e } = env();
		const ask = (authorization?: string) =>
			worker.fetch(
				new Request("https://ops.test/mcp", {
					method: "POST",
					headers: authorization ? { authorization } : {},
					body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
				}),
				e,
			);
		expect((await ask()).status).toBe(401);
		expect((await ask("Bearer a guess")).status).toBe(401);
		const ok = await ask("Bearer the operator's key");
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
	});

	it("introduces itself and lists its tools", async () => {
		const { env: e } = env();
		const hello = (await answer(e, {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2025-06-18" },
		})) as { result: { serverInfo: { name: string } } };
		expect(hello.result.serverInfo.name).toBe("cdl-ops");
		const list = (await answer(e, {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
		})) as { result: { tools: { name: string }[] } };
		expect(list.result.tools.map((tool) => tool.name)).toContain(
			"fleet_status",
		);
		// A notification has no answer.
		expect(
			await answer(e, { jsonrpc: "2.0", method: "notifications/initialized" }),
		).toBeNull();
	});

	it("says how every library is", async () => {
		const { env: e } = env({
			...healthy,
			ok: false,
			late: ["backup"],
			checks: [{ ...healthy.checks[0]!, value: 3, failing_since: 10 }],
		});
		const { result } = await call(e, "fleet_status");
		const [library] = JSON.parse(result.content[0]!.text);
		expect(library).toMatchObject({
			library: "our-street",
			ok: false,
			lateJobs: ["backup"],
			failingChecks: [{ check: "emails_stuck", value: 3 }],
		});
	});

	it("runs a check only once the operator has said yes", async () => {
		const { env: e, library } = env();
		const first = await call(e, "run_check", { slug: "our-street" });
		expect(first.result.content[0]!.text).toMatch(/confirm: true/);
		expect(library.opsRunCheck).not.toHaveBeenCalled();
		await call(e, "run_check", { slug: "our-street", confirm: true });
		expect(library.opsRunCheck).toHaveBeenCalled();
	});

	it("reads only its own dataset", async () => {
		const { env: e } = env();
		const query = vi.fn(async () => ({ data: [], rows: 0 }));
		(e as unknown as { ANALYTICS_SQL: unknown }).ANALYTICS_SQL = { query };
		const refused = await call(e, "query_events", {
			sql: "SELECT * FROM events.httpRequests",
		});
		expect(refused.result.isError).toBe(true);
		await call(e, "query_events", {
			sql: 'SELECT blob1 FROM events.analyticsEngine."cdl_events"',
		});
		expect(query).toHaveBeenCalledWith(
			expect.objectContaining({
				query: expect.stringMatching(/LIMIT 1000$/),
			}),
		);
	});
});

describe("the alert inbox", () => {
	it("names an Issue by what failed and where", async () => {
		const { env: e, db } = env();
		await worker.fetch(
			new Request("https://ops.test/alerts", {
				method: "POST",
				headers: { "cf-webhook-auth": "the webhook's key" },
				body: JSON.stringify({
					name: "CDL: ops",
					text: "Real-Time Issue 'job.missed backup' detected in our-street-core. - Issue ID: 1",
				}),
			}),
			e,
		);
		const [insert] = db.kept;
		expect(insert?.[3]).toBe("our-street");
		expect(insert?.[4]).toBe("job.missed backup (our-street-core)");
	});

	it("keeps what Cloudflare posts with the webhook's key, and nothing else", async () => {
		const { env: e, db } = env();
		const post = (secret: string) =>
			worker.fetch(
				new Request("https://ops.test/alerts", {
					method: "POST",
					headers: { "cf-webhook-auth": secret },
					body: JSON.stringify({
						name: "CDL: our-street: a Worker is failing",
						text: "our-street-core: check.failed emails_stuck",
						alert_type: "workers_observability_real_time_issue",
					}),
				}),
				e,
			);
		expect((await post("wrong")).status).toBe(403);
		expect((await post("the webhook's key")).status).toBe(204);
		const [insert] = db.kept;
		expect(insert?.[3]).toBe("our-street");
		expect(insert?.[4]).toBe("CDL: our-street: a Worker is failing");
	});
});

describe("the alert relay", () => {
	const issue = (title: string, worker: string) =>
		new Request("https://ops.test/alerts", {
			method: "POST",
			headers: { "cf-webhook-auth": "the webhook's key" },
			body: JSON.stringify({
				name: "CDL: ops",
				alert_type: "workers_observability_real_time_issue",
				text: `Real-Time Issue '${title}' detected in ${worker}. - Issue ID: 1`,
			}),
		});

	function mailed() {
		const made = env();
		const send = vi.fn(async () => {});
		Object.assign(made.env, {
			EMAIL: { send },
			ALERTS_EMAIL: "Operator@example.com",
		});
		return { ...made, send };
	}

	it("emails a failure to the library's admins and the operator", async () => {
		const { env: e, send } = mailed();
		await worker.fetch(issue("job.missed backup", "our-street-core"), e);
		const to = send.mock.calls.map(
			(call) => (call as unknown as [{ to: string; subject: string }])[0],
		);
		expect(to.map((one) => one.to).sort()).toEqual([
			"dana@example.com",
			"operator@example.com",
		]);
		expect(to[0]?.subject).toMatch(/our-street\.example\.org/);
	});

	it("keeps a scanner's probing, and emails nobody", async () => {
		const { env: e, db, send } = mailed();
		await worker.fetch(
			issue(
				"Potential vulnerability scan · secret-files · low risk",
				"cdl-reports",
			),
			e,
		);
		expect(db.kept).toHaveLength(2);
		expect(send).not.toHaveBeenCalled();
	});
});

describe("the runbooks", () => {
	it("are found from what an alert says", () => {
		expect(runbookFor("check.failed emails_stuck")).toBe(
			"docs/runbooks/emails-stuck.md",
		);
		expect(runbookFor("job.missed backup")).toBe("docs/runbooks/job-missed.md");
		expect(runbookFor("TypeError in routes-loans.ts")).toBe(
			"docs/runbooks/new-failure.md",
		);
	});
});

describe("the weekly digest", () => {
	it("says a quiet week in one line", async () => {
		const { env: e } = env();
		expect(await digest(e)).toMatch(/^Nothing to report this week/);
	});

	it("names what is failing, by library", async () => {
		const { env: e } = env({ ...healthy, late: ["backup"] });
		const text = await digest(e);
		expect(text).toMatch(/our-street .*\n- the backup job is late/);
		expect(text).not.toMatch(/@/);
	});
});
