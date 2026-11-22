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
