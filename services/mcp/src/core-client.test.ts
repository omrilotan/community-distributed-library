import { describe, expect, it, vi } from "vitest";
import { coreClient } from "./core-client.ts";
import type { Env, Props } from "./env.ts";

const props: Props = {
	memberId: "member",
	scopes: ["catalogue:read"],
	coreToken: "core-token",
	clientName: "An assistant",
};

const answering = (status: number) =>
	({
		CORE: {
			fetch: async () =>
				new Response(status === 204 ? null : JSON.stringify({ status }), {
					status,
				}),
		},
	}) as unknown as Env;

describe("calling core for an assistant", () => {
	it("gives the connection up when core no longer takes its token", async () => {
		const onRevoked = vi.fn(async () => undefined);
		const call = coreClient(answering(401), props, onRevoked);
		expect((await call("/v1/me")).status).toBe(401);
		expect(onRevoked).toHaveBeenCalledOnce();
	});

	it("keeps it otherwise", async () => {
		const onRevoked = vi.fn(async () => undefined);
		const call = coreClient(answering(403), props, onRevoked);
		await call("/v1/admin/stats");
		expect(onRevoked).not.toHaveBeenCalled();
	});
});
