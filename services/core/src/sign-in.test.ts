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

describe("a suspended member", () => {
	it("gets no session from a link", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET status = 'suspended' WHERE member_id = ?",
		)
			.bind(DANA)
			.run();
		const asked = await api(null, "POST", "/v1/auth/magic-link", {
			email: "dana@example.com",
		});
		const token = new URL(asked.body.debugUrl).searchParams.get("token");
		expect(
			(await api(null, "POST", "/v1/auth/exchange", { token })).status,
		).toBe(410);
		await env.DB.prepare(
			"UPDATE memberships SET status = 'active' WHERE member_id = ?",
		)
			.bind(DANA)
			.run();
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

/**
 * The email's code: for a browser the link cannot reach. It signs in the
 * browser that asked and nobody else, once, and only a handful of guesses
 * are ever weighed.
 */
describe("a sign-in code", () => {
	let n = 0;
	/** A browser's own random value, as the site keeps in a cookie. */
	const browser = () => `test-browser-${Date.now()}-${++n}`.padEnd(43, "x");
	const ask = async (email: string, from: string) => {
		const asked = await api(null, "POST", "/v1/auth/magic-link", {
			email,
			browser: from,
		});
		expect(asked.status).toBe(200);
		return {
			code: asked.body.debugCode as string,
			token: new URL(asked.body.debugUrl).searchParams.get("token"),
		};
	};
	const type = (from: string, code: string) =>
		api(null, "POST", "/v1/auth/code", { browser: from, code });
	const wrong = (code: string) =>
		String((Number(code) + 1) % 100_000_000).padStart(8, "0");

	it("signs in the browser that asked, once, and spends the link too", async () => {
		const here = browser();
		const { code, token } = await ask("sam@example.com", here);
		expect(code).toMatch(/^\d{8}$/);

		const signedIn = await type(here, code);
		expect(signedIn.status).toBe(200);
		expect(
			(await api({ token: signedIn.body.token }, "GET", "/v1/me")).body.id,
		).toBe(SAM);
		expect((await type(here, code)).status).toBe(410);
		expect(
			(await api(null, "POST", "/v1/auth/exchange", { token })).status,
		).toBe(410);
	});

	it("does nothing in another browser", async () => {
		const { code } = await ask("dana@example.com", browser());
		expect((await type(browser(), code)).status).toBe(410);
	});

	it("is spent by the link", async () => {
		const here = browser();
		const { code, token } = await ask("dana@example.com", here);
		expect(
			(await api(null, "POST", "/v1/auth/exchange", { token })).status,
		).toBe(200);
		expect((await type(here, code)).status).toBe(410);
	});

	it("is not made for a link asked without a browser", async () => {
		const asked = await api(null, "POST", "/v1/auth/magic-link", {
			email: "sam@example.com",
		});
		expect(asked.body.debugCode).toBeUndefined();
	});

	it("weighs five guesses at most, even all at once", async () => {
		const here = browser();
		const { code } = await ask("sam@example.com", here);
		const guesses = await Promise.all(
			Array.from({ length: 5 }, () => type(here, wrong(code))),
		);
		expect(guesses.map((guess) => guess.status)).toEqual([
			410, 410, 410, 410, 410,
		]);
		expect((await type(here, code)).status).toBe(410);
	});

	it("comes with an address's first five links of the day, not after", async () => {
		// Five links already sent to Dana today.
		await env.DB.prepare(
			`INSERT INTO rate_limits (bucket, subject, window_end, count)
			 VALUES ('magic_link:email:day', 'dana@example.com', unixepoch() + 3600, 5)
			 ON CONFLICT (bucket, subject) DO UPDATE SET count = 5`,
		).run();
		const asked = await api(null, "POST", "/v1/auth/magic-link", {
			email: "dana@example.com",
			browser: browser(),
		});
		expect(asked.status).toBe(200);
		expect(asked.body.debugUrl).toBeTruthy();
		expect(asked.body.debugCode).toBeUndefined();
	});

	it("takes only eight digits", async () => {
		expect((await type(browser(), "1234")).status).toBe(422);
	});
});
