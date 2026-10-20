import { expect, test } from "@playwright/test";

const MCP = "http://localhost:8788";
const REDIRECT = "https://assistant.example/cb";

/**
 * The consent screen names the client that registered and where the code
 * goes, whatever the link says, and approving sends the code only there.
 */
test.describe("connecting an assistant with OAuth", () => {
	async function start(
		request: import("@playwright/test").APIRequestContext,
		scope = "catalogue:read",
	): Promise<string> {
		const registered = await request.post(`${MCP}/register`, {
			data: {
				client_name: "Test Assistant",
				redirect_uris: [REDIRECT],
				token_endpoint_auth_method: "none",
			},
		});
		const { client_id } = (await registered.json()) as { client_id: string };
		const query = new URLSearchParams({
			response_type: "code",
			client_id,
			redirect_uri: REDIRECT,
			scope,
			state: "s1",
			code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
			code_challenge_method: "S256",
		});
		const authorized = await request.get(`${MCP}/authorize?${query}`, {
			maxRedirects: 0,
		});
		const location = authorized.headers()["location"] ?? "";
		expect(location).toMatch(/\/oauth\/consent\?req=[0-9a-f-]{36}$/);
		return new URL(location).search;
	}

	test("shows the registered client and where the code goes", async ({
		page,
		request,
	}) => {
		const search = await start(request);
		// A name in the link is not a name on the screen.
		await page.goto(`/oauth/consent${search}&client=Claude`);
		await expect(page.locator("main")).toContainText("Test Assistant");
		await expect(page.locator("main")).not.toContainText("Claude");
		await expect(page.locator("main")).toContainText("assistant.example");

		// The browser follows the redirects to the assistant; nothing is there.
		const arrived = page.waitForRequest(/^https:\/\/assistant\.example\/cb\?/);
		await page.locator('form[action="/api/oauth/approve"] button').click();
		const landed = (await arrived).url();
		const back = new URL(landed);
		expect(back.searchParams.get("code")).toBeTruthy();
		expect(back.searchParams.get("state")).toBe("s1");
	});

	test("ticks only looking; acting for the member is theirs to tick", async ({
		page,
		request,
	}) => {
		await page.goto(
			`/oauth/consent${await start(request, "catalogue:read loans:write")}`,
		);
		await expect(
			page.locator('input[name="scope"][value="catalogue:read"]'),
		).toBeChecked();
		await expect(
			page.locator('input[name="scope"][value="loans:write"]'),
		).not.toBeChecked();
	});

	test("turns away a request it did not start", async ({ page }) => {
		await page.goto(
			"/oauth/consent?req=00000000-0000-0000-0000-000000000000&client=Claude&scope=admin",
		);
		await expect(page.locator(".callout")).toBeVisible();
		await expect(page.locator('form[action="/api/oauth/approve"]')).toHaveCount(
			0,
		);
	});
});
