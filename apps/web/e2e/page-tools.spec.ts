import { expect, test, type Page } from "@playwright/test";
import { BORROWER, OWNER, asMember } from "./library.ts";

/**
 * WebMCP: the library's pages offer an agent in the browser the tools its
 * MCP server offers an assistant. The test browser has no agent, so the page
 * gets a stand-in `document.modelContext` that keeps what it is given.
 */
interface Offered {
	name: string;
	description: string;
	inputSchema: { properties?: Record<string, unknown> };
	annotations: Record<string, boolean>;
	execute(input: unknown): Promise<string>;
}

async function withAgent(page: Page) {
	await page.addInitScript(() => {
		const tools = new Map<string, unknown>();
		Object.assign(window, { offeredTools: tools });
		Object.defineProperty(document, "modelContext", {
			value: {
				registerTool(
					tool: { name: string },
					options?: { signal?: AbortSignal },
				) {
					if (tools.has(tool.name)) throw new Error("already registered");
					tools.set(tool.name, tool);
					options?.signal?.addEventListener("abort", () =>
						tools.delete(tool.name),
					);
				},
			},
		});
	});
}

const offered = (page: Page) =>
	page.evaluate(() =>
		[
			...(
				window as unknown as { offeredTools: Map<string, Offered> }
			).offeredTools.values(),
		].map(({ name, description, inputSchema, annotations }) => ({
			name,
			description,
			inputSchema,
			annotations,
		})),
	);

const use = (page: Page, name: string, input: unknown) =>
	page.evaluate(
		([name, input]) =>
			(window as unknown as { offeredTools: Map<string, Offered> }).offeredTools
				.get(name as string)!
				.execute(input),
		[name, input] as const,
	);

/** The page has registered its tools once the list stops growing past a few. */
async function opened(page: Page, path = "/") {
	await withAgent(page);
	await page.goto(path);
	await expect
		.poll(async () => (await offered(page)).length)
		.toBeGreaterThan(20);
	return offered(page);
}

test("offers a member the MCP server's tools", async ({ page }) => {
	const tools = await opened(page);
	const byName = new Map(tools.map((tool) => [tool.name, tool]));
	expect(byName.has("search_catalogue")).toBe(true);
	expect(byName.has("request_loan")).toBe(true);
	// A moderator's tools are for moderators.
	expect(byName.has("edit_item")).toBe(false);

	// Looking is read-only; anything that changes something, the browser
	// should ask about; everything may carry another member's words.
	expect(byName.get("list_my_shelf")!.annotations).toMatchObject({
		readOnlyHint: true,
		consequentialHint: false,
		untrustedContentHint: true,
	});
	const request = byName.get("request_loan")!;
	expect(request.annotations).toMatchObject({
		readOnlyHint: false,
		consequentialHint: true,
	});
	expect(request.description).toContain("get the member's yes first");
	expect(Object.keys(request.inputSchema.properties ?? {})).toContain("copyId");
});

test("runs a tool as the signed-in member", async ({ page }) => {
	await opened(page);
	const me = JSON.parse(await use(page, "my_profile", {}));
	expect(me.id).toBe(BORROWER.id);

	// Core's refusals and bad input come back as errors the agent can read.
	expect(
		await use(page, "get_work", { workId: "01J0NOSUCHWORK000000000000" }),
	).toMatch(/^Error 404/);
	expect(await use(page, "request_loan", {})).toMatch(/^Error 400/);
});

test("changes what the member asked to change, and nothing more", async ({
	page,
	request,
}) => {
	await opened(page);
	expect(await use(page, "set_lend_limit", { books: 3 })).not.toMatch(/^Error/);
	expect((await asMember(request, BORROWER.id, "/v1/me")).body.lendLimit).toBe(
		3,
	);
	await use(page, "set_lend_limit", {});
	expect(
		(await asMember(request, BORROWER.id, "/v1/me")).body.lendLimit,
	).toBeNull();
});

test("refuses a call from another site", async ({ page }) => {
	await page.goto("/");
	const response = await page.request.post("/api/tools/my_profile", {
		headers: { origin: "https://elsewhere.example" },
		data: {},
	});
	expect(response.status()).toBe(403);
});

test("offers nothing to a visitor who is not signed in", async ({
	browser,
}) => {
	const stranger = await browser.newContext({
		storageState: { cookies: [], origins: [] },
	});
	const response = await stranger.request.get("/api/tools");
	expect(response.status()).toBe(401);
	await stranger.close();
});

test.describe("a moderator", () => {
	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "moderator",
		});
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("gets the moderator's tools too", async ({ page }) => {
		const tools = await opened(page);
		const names = tools.map((tool) => tool.name);
		expect(names).toContain("edit_item");
		expect(names).toContain("remove_tag");
	});
});
