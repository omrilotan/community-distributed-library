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
		expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
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
			linkset: { anchor: string; item?: { href: string }[] }[];
		};
		const items = catalog.linkset[0]!.item!.map((item) => item.href);
		expect(items.some((href) => href.endsWith("/mcp"))).toBe(true);
		expect(items.some((href) => href.endsWith("/api/v1"))).toBe(true);
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
