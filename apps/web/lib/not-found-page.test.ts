import { describe, expect, it, vi } from "vitest";
import {
	NOT_FOUND_PATH,
	localeOf,
	routed,
	withNotFoundPage,
} from "./not-found-page.ts";

const ROUTES = ["about", "works", ".well-known", "favicon.ico"];
const ORIGIN = "https://library.test";
const ctx = {
	waitUntil() {},
	passThroughOnException() {},
} as unknown as ExecutionContext;

describe("routed", () => {
	it("sends the app's own addresses on", () => {
		for (const path of [
			"/",
			"/about",
			"/works/42",
			"/.well-known/ard.json",
			"/favicon.ico",
			"/_next/static/x.js",
			"/__vinext/x",
		])
			expect(routed(path, ROUTES)).toBe(true);
	});

	it("catches what no route answers", () => {
		for (const path of [
			"/site/.env",
			"/.env",
			"/wp-content.zip",
			"/config/secrets.yaml",
			"/%E0%A4%A",
		])
			expect(routed(path, ROUTES)).toBe(false);
	});

	it("rules nothing out when app/ has a dynamic or grouped top segment", () => {
		expect(routed("/.env", [...ROUTES, "[slug]"])).toBe(true);
		expect(routed("/.env", [...ROUTES, "(public)"])).toBe(true);
	});
});

describe("localeOf", () => {
	const with_ = (cookie?: string) =>
		new Request(ORIGIN, { headers: cookie ? { cookie } : {} });

	it("reads the app's locale cookie", () => {
		expect(localeOf(with_("a=b; locale=he"))).toBe("he");
	});

	it("falls back to English", () => {
		expect(localeOf(with_())).toBe("en");
		expect(localeOf(with_("locale=xx"))).toBe("en");
	});
});

describe("withNotFoundPage", () => {
	const notFound = (body = "<p>lost</p>") =>
		new Response(body, {
			status: 404,
			headers: {
				"content-type": "text/html; charset=utf-8",
				"content-security-policy": "script-src 'nonce-abc'",
				"set-cookie": "x=y",
			},
		});

	const app = (respond: (request: Request) => Response | Promise<Response>) => {
		const seen: Request[] = [];
		return {
			seen,
			fetch: vi.fn(async (request: Request) => {
				seen.push(request);
				return respond(request);
			}),
		};
	};

	it("passes routed addresses and writes straight to the app", async () => {
		const inner = app(() => new Response("ok"));
		const worker = withNotFoundPage(inner, ROUTES);
		await worker.fetch(new Request(`${ORIGIN}/about`), {}, ctx);
		await worker.fetch(
			new Request(`${ORIGIN}/.env`, { method: "POST" }),
			{},
			ctx,
		);
		expect(inner.seen.map((r) => new URL(r.url).pathname)).toEqual([
			"/about",
			"/.env",
		]);
	});

	it("renders the 404 page once and answers from memory after", async () => {
		const inner = app(() => notFound());
		const worker = withNotFoundPage(inner, ROUTES);
		const answers = await Promise.all(
			["/.env", "/backup.zip", "/site/.env"].map((path) =>
				worker.fetch(new Request(`${ORIGIN}${path}`), {}, ctx),
			),
		);
		expect(inner.fetch).toHaveBeenCalledTimes(1);
		const asked = inner.seen[0]!;
		expect(new URL(asked.url).pathname).toBe(NOT_FOUND_PATH);
		expect(asked.headers.get("cookie")).toBe("locale=en");
		for (const answer of answers) {
			expect(answer.status).toBe(404);
			expect(await answer.text()).toBe("<p>lost</p>");
			expect(answer.headers.get("set-cookie")).toBeNull();
			expect(answer.headers.get("content-security-policy")).toBe(
				"script-src 'nonce-abc'",
			);
			expect(answer.headers.get("x-cdl-cache")).toBe("memory");
		}
	});

	it("keeps one page per language", async () => {
		const inner = app((request) =>
			notFound(request.headers.get("cookie") ?? ""),
		);
		const worker = withNotFoundPage(inner, ROUTES);
		const he = await worker.fetch(
			new Request(`${ORIGIN}/.env`, { headers: { cookie: "locale=he" } }),
			{},
			ctx,
		);
		const en = await worker.fetch(new Request(`${ORIGIN}/.env`), {}, ctx);
		expect(await he.text()).toBe("locale=he");
		expect(await en.text()).toBe("locale=en");
	});

	it("renders again once the page is stale", async () => {
		let time = 0;
		const inner = app(() => notFound());
		const worker = withNotFoundPage(inner, ROUTES, () => time);
		await worker.fetch(new Request(`${ORIGIN}/.env`), {}, ctx);
		time = 11 * 60_000;
		await worker.fetch(new Request(`${ORIGIN}/.env`), {}, ctx);
		expect(inner.fetch).toHaveBeenCalledTimes(2);
	});

	it("answers a plain 404 when the page cannot be rendered, and tries again next time", async () => {
		let fail = true;
		const inner = app(() => {
			if (fail) throw new Error("Network connection lost.");
			return notFound();
		});
		const worker = withNotFoundPage(inner, ROUTES);
		const first = await worker.fetch(new Request(`${ORIGIN}/.env`), {}, ctx);
		expect(first.status).toBe(404);
		expect(await first.text()).toBe("Not found");
		fail = false;
		const second = await worker.fetch(new Request(`${ORIGIN}/.env`), {}, ctx);
		expect(await second.text()).toBe("<p>lost</p>");
	});

	it("keeps nothing that is not a 404 page", async () => {
		const inner = app(() => new Response("oops", { status: 500 }));
		const worker = withNotFoundPage(inner, ROUTES);
		const answer = await worker.fetch(new Request(`${ORIGIN}/.env`), {}, ctx);
		expect(answer.status).toBe(404);
		await worker.fetch(new Request(`${ORIGIN}/.env`), {}, ctx);
		expect(inner.fetch).toHaveBeenCalledTimes(2);
	});

	it("sends no body to HEAD", async () => {
		const worker = withNotFoundPage(
			app(() => notFound()),
			ROUTES,
		);
		const answer = await worker.fetch(
			new Request(`${ORIGIN}/.env`, { method: "HEAD" }),
			{},
			ctx,
		);
		expect(answer.status).toBe(404);
		expect(await answer.text()).toBe("");
	});
});
