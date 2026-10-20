import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, as, DANA, SAM } from "../test/api.ts";
import { app } from "./app.ts";
import type { Env } from "./env.ts";

/** A session the way the site gets one: a sign-in link, traded in. */
async function signIn(email: string) {
	const asked = await api(null, "POST", "/v1/auth/magic-link", { email });
	const token = new URL(asked.body.debugUrl).searchParams.get("token");
	return (await api(null, "POST", "/v1/auth/exchange", { token })).body
		.token as string;
}

describe("a session", () => {
	it("ends at sign-out, and opens nothing after", async () => {
		const session = await signIn("sam@example.com");
		expect((await api({ token: session }, "GET", "/v1/me")).status).toBe(200);
		expect(
			(await api({ token: session }, "POST", "/v1/auth/logout")).status,
		).toBe(204);
		expect((await api({ token: session }, "GET", "/v1/me")).status).toBe(401);
	});
});

describe("a personal token", () => {
	it("opens nothing once revoked, and only its own member may revoke it", async () => {
		const minted = await as(SAM).post("/v1/me/tokens", {
			clientName: `Revoked ${Date.now()}`,
			scopes: ["profile:read"],
		});
		const { id, token } = minted.body as { id: string; token: string };
		expect((await api({ token }, "GET", "/v1/me")).status).toBe(200);

		expect((await as(DANA).del(`/v1/me/tokens/${id}`)).status).toBe(404);
		expect((await api({ token }, "GET", "/v1/me")).status).toBe(200);

		expect((await as(SAM).del(`/v1/me/tokens/${id}`)).status).toBe(204);
		expect((await api({ token }, "GET", "/v1/me")).status).toBe(401);
	});
});

/**
 * Development's shortcuts, with DEV_AUTH off as it is in every library: the
 * same app, called with the switch taken out of its environment.
 */
describe("without development sign-in", () => {
	const live = { ...env, DEV_AUTH: undefined } as unknown as Env;
	const call = async (path: string, init: RequestInit = {}) => {
		const ctx = createExecutionContext();
		const response = await app.request(
			`http://core.test${path}`,
			init,
			live,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		return response;
	};
	const json = (body: unknown): RequestInit => ({
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

	it("takes nobody's word for who they are", async () => {
		const asked = await call("/v1/me", { headers: { "X-Member-Id": SAM } });
		expect(asked.status).toBe(401);
	});

	it("has no switch for what the library lends", async () => {
		const switched = await call(
			"/v1/dev/library-type",
			json({ type: "things" }),
		);
		expect(switched.status).toBe(404);
	});

	it("hands no sign-in link back, and answers a stranger as it does a member", async () => {
		const member = await call(
			"/v1/auth/magic-link",
			json({ email: "dana@example.com" }),
		);
		const stranger = await call(
			"/v1/auth/magic-link",
			json({ email: "nobody@example.com" }),
		);
		expect(member.status).toBe(200);
		expect(await member.json()).toEqual({ ok: true });
		expect(stranger.status).toBe(200);
		expect(await stranger.json()).toEqual({ ok: true });
	});

	it("takes no webhook on a local address", async () => {
		const session = await signIn("dana@example.com");
		// Development takes one, to try hooks on a laptop.
		expect(
			(
				await api({ token: session }, "POST", "/v1/me/webhooks", {
					url: "http://localhost:9999/hook",
				})
			).status,
		).toBe(201);
		const local = await call("/v1/me/webhooks", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${session}`,
			},
			body: JSON.stringify({ url: "http://localhost:9999/hook" }),
		});
		expect(local.status).toBe(422);
	});
});
