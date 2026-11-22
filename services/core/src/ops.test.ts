import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { COPY_A, DANA, SAM, as } from "../test/api.ts";
import * as ops from "./ops.ts";

describe("what the ops MCP asks of a library", () => {
	it("tells its state in counts, with no member in it", async () => {
		const state = await ops.status(env);
		expect(state.ok).toBe(true);
		expect(state.queues.emailsOverdue).toBe(0);
		expect(JSON.stringify(state)).not.toMatch(/@|Dana|Sam/);
	});

	it("follows one loan's notices by ids and statuses", async () => {
		const { body } = await as(SAM).post("/v1/loans", { copyId: COPY_A });
		const trace = await ops.deliveryTrace(env, body.id);
		expect(trace?.loan).toMatchObject({ id: body.id, status: "requested" });
		expect(trace?.events.map((event) => event.kind)).toContain(
			"loan.requested",
		);
		expect(JSON.stringify(trace)).not.toMatch(/@|Dana|Sam/);
		expect(await ops.deliveryTrace(env, "nothing")).toBeNull();
	});

	it("names the admins for the digest, and nobody else", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ?",
		)
			.bind(DANA)
			.run();
		expect(await ops.admins(env)).toEqual(["dana@example.com"]);
	});
});

describe("the admin's view of the library", () => {
	const admin = async () =>
		env.DB.prepare("UPDATE memberships SET role = 'admin' WHERE member_id = ?")
			.bind(DANA)
			.run();

	it("is the admin's alone", async () => {
		expect((await as(SAM).get("/v1/admin/health")).status).toBe(403);
		// A moderator moderates; how the library runs is the admin's.
		expect((await as(DANA).get("/v1/admin/health")).status).toBe(403);
		await admin();
		const { status, body } = await as(DANA).get("/v1/admin/health");
		expect(status).toBe(200);
		expect(body.parts.database).toBe("ok");
	});

	it("answers with numbers, jobs, a loan's trace and checks run now", async () => {
		await admin();
		const numbers = await as(DANA).get("/v1/admin/numbers");
		expect(numbers.body.members).toBe(3);
		expect((await as(DANA).get("/v1/admin/jobs?days=3")).body.items).toEqual(
			[],
		);
		const loan = await as(SAM).post("/v1/loans", { copyId: COPY_A });
		const trace = await as(DANA).get(
			`/v1/admin/loans/${loan.body.id}/delivery`,
		);
		expect(trace.body.loan.status).toBe("requested");
		expect(
			(await as(DANA).get("/v1/admin/loans/nothing/delivery")).status,
		).toBe(404);
		const checks = await as(DANA).post("/v1/admin/checks", {
			check: "emails_stuck",
		});
		expect(checks.body.items).toEqual([
			expect.objectContaining({ name: "emails_stuck", ok: true }),
		]);
		expect(
			(await as(DANA).post("/v1/admin/checks", { check: "nonsense" })).status,
		).toBe(422);
	});
});
