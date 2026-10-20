import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { edgeSeconds, shareable, withEdgeCache } from "./edge-cache.ts";

const URL_ = "https://library.test/";
const visit = (headers: Record<string, string> = {}, url = URL_) =>
	new Request(url, { headers });

describe("shareable", () => {
	it("takes a plain visit with no cookie", () => {
		expect(shareable(visit())).toBe(true);
		expect(shareable(visit({}, `${URL_}?tags=genre:poetry`))).toBe(true);
	});

	it("refuses anything that could be somebody's own", () => {
		expect(shareable(visit({ cookie: "locale=he" }))).toBe(false);
		expect(shareable(visit({ authorization: "Bearer x" }))).toBe(false);
		expect(shareable(new Request(URL_, { method: "POST" }))).toBe(false);
	});

	it("refuses the router's own requests", () => {
		expect(shareable(visit({ rsc: "1" }))).toBe(false);
		expect(shareable(visit({ "next-router-state-tree": "x" }))).toBe(false);
		expect(shareable(visit({ "x-vinext-rsc-render-mode": "x" }))).toBe(false);
		expect(shareable(visit({}, `${URL_}?_rsc=abc`))).toBe(false);
	});
});

describe("edgeSeconds", () => {
	const page = (headers: Record<string, string>, status = 200) =>
		new Response("page", { status, headers });

	it("reads how long the page lets the edge keep it", () => {
		expect(edgeSeconds(page({ "cdn-cache-control": "max-age=3600" }))).toBe(
			3600,
		);
	});

	it("keeps nothing unasked, failed, or setting a cookie", () => {
		expect(edgeSeconds(page({}))).toBe(0);
		expect(edgeSeconds(page({ "cdn-cache-control": "max-age=60" }, 500))).toBe(
			0,
		);
		expect(
			edgeSeconds(
				page({ "cdn-cache-control": "max-age=60", "set-cookie": "a=b" }),
			),
		).toBe(0);
	});
});

describe("withEdgeCache", () => {
	let store: Map<string, Response>;
	const ctx = {
		waits: [] as Promise<unknown>[],
		waitUntil(promise: Promise<unknown>) {
			this.waits.push(promise);
		},
		passThroughOnException() {},
	};

	beforeEach(() => {
		store = new Map();
		vi.stubGlobal("__BUILD_STAMP__", "b1");
		vi.stubGlobal("caches", {
			default: {
				match: async (key: Request) => store.get(key.url)?.clone(),
				put: async (key: Request, response: Response) => {
					store.set(key.url, response);
				},
			},
		});
		ctx.waits = [];
	});
	afterEach(() => vi.unstubAllGlobals());

	const page = (count: { n: number }, edge = true) => ({
		fetch: async () => {
			count.n += 1;
			return new Response(`page ${count.n}`, {
				headers: {
					"cache-control": "no-store, must-revalidate",
					...(edge ? { "cdn-cache-control": "max-age=3600" } : {}),
				},
			});
		},
	});

	it("makes the page once and serves the next stranger the same", async () => {
		const count = { n: 0 };
		const worker = withEdgeCache(page(count));
		const first = await worker.fetch(visit(), {}, ctx as never);
		await Promise.all(ctx.waits);
		const second = await worker.fetch(visit(), {}, ctx as never);
		expect(await first.text()).toBe("page 1");
		expect(await second.text()).toBe("page 1");
		expect(count.n).toBe(1);
		expect(second.headers.get("x-cdl-cache")).toBe("hit");
		// The browser is still told to keep nothing.
		expect(second.headers.get("cache-control")).toBe(
			"no-store, must-revalidate",
		);
	});

	it("never answers somebody with a cookie from the store", async () => {
		const count = { n: 0 };
		const worker = withEdgeCache(page(count));
		await worker.fetch(visit(), {}, ctx as never);
		await Promise.all(ctx.waits);
		const mine = await worker.fetch(
			visit({ cookie: "cdl_session=x" }),
			{},
			ctx as never,
		);
		expect(await mine.text()).toBe("page 2");
	});

	it("keeps nothing the page did not offer", async () => {
		const count = { n: 0 };
		const worker = withEdgeCache(page(count, false));
		await worker.fetch(visit(), {}, ctx as never);
		await Promise.all(ctx.waits);
		await worker.fetch(visit(), {}, ctx as never);
		expect(count.n).toBe(2);
		expect(store.size).toBe(0);
	});
});
