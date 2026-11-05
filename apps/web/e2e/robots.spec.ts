import { expect, test } from "@playwright/test";
import { CORE } from "./library.ts";

/**
 * No library is for search engines: robots.txt closes it, and every page says
 * noindex in a header and a meta tag, for a crawler that arrives through
 * somebody else's link. Only the project's front door is public.
 */
test.describe("crawlers", () => {
	test("are kept out of the whole library", async ({ request }) => {
		const response = await request.get("/robots.txt");
		expect(response.status()).toBe(200);
		expect(await response.text()).toBe(
			"User-agent: *\nContent-Signal: search=no, ai-input=no, ai-train=no\nDisallow: /\n",
		);
		expect((await request.get("/sitemap.xml")).status()).toBe(404);
	});

	for (const path of [
		"/",
		"/about",
		"/works/01J0SEEDWORK00000000000001",
		"/login",
		"/shelf",
	] as const) {
		test(`are told "noindex, nofollow" on ${path}`, async ({ browser }) => {
			// As a crawler comes: nobody signed in.
			const visitor = await browser.newContext({
				storageState: { cookies: [], origins: [] },
			});
			const page = await visitor.newPage();
			const response = await page.goto(path);
			expect(response!.headers()["x-robots-tag"]).toBe("noindex, nofollow");
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
				"content",
				"noindex, nofollow",
			);
			await visitor.close();
		});
	}
});

test.describe("agents", () => {
	test("are pointed from every page to the API catalogue", async ({ page }) => {
		const response = await page.goto("/about");
		expect(response!.headers()["link"]).toContain(
			'</.well-known/api-catalog>; rel="api-catalog"',
		);
	});

	test("find the MCP server and the REST API in the catalogue", async ({
		request,
	}) => {
		const response = await request.get("/.well-known/api-catalog");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain(
			"application/linkset+json",
		);
		const catalog = (await response.json()) as {
			linkset: {
				anchor: string;
				item?: { href: string }[];
				"service-meta"?: { href: string }[];
			}[];
		};
		const items = catalog.linkset[0]!.item!.map((item) => item.href);
		expect(items.some((href) => href.endsWith("/mcp"))).toBe(true);
		expect(items.some((href) => href.endsWith("/api/v1"))).toBe(true);
		// RFC 9728: the metadata of the resource /mcp lives at its own path.
		const mcp = catalog.linkset.find((set) => set.anchor.endsWith("/mcp"))!;
		expect(mcp["service-meta"]![0]!.href).toMatch(
			/\/\.well-known\/oauth-protected-resource\/mcp$/,
		);
	});

	test("find the MCP server's card on the library's own host", async ({
		request,
	}) => {
		const response = await request.get("/.well-known/mcp/server-card.json");
		expect(response.status()).toBe(200);
		const card = (await response.json()) as {
			serverInfo: { name: string; version: string };
			transport: { type: string; endpoint: string };
		};
		expect(card.serverInfo.name).toBe("community-distributed-library");
		expect(card.transport.type).toBe("streamable-http");
		expect(card.transport.endpoint).toMatch(/^https?:\/\/[^/]+\/mcp$/);
	});

	test("are told in auth.md that they cannot register, and how to connect", async ({
		request,
	}) => {
		const response = await request.get("/auth.md");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("text/markdown");
		const text = await response.text();
		expect(text.split("\n")[0]).toMatch(/^# .+ auth\.md$/);
		expect(text).toContain("Agents cannot register here");
		expect(text).toMatch(/\/\.well-known\/oauth-protected-resource\/mcp/);
		expect(text).toContain("`catalogue:read`");
	});

	test("can read how to connect in llms.txt", async ({ request }) => {
		const response = await request.get("/llms.txt");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("text/markdown");
		const text = await response.text();
		// Named after the library, whatever it is called locally.
		const { name } = (await (
			await request.get(`${CORE}/v1/community`)
		).json()) as {
			name: string;
		};
		expect(text.split("\n")[0]).toContain(name);
		expect(text).toMatch(/\[MCP server\]\(https?:\/\/[^)]+\/mcp\)/);
		expect(text).toContain("/api/v1/openapi.json");
	});
});
