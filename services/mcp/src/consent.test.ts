import { describe, expect, it } from "vitest";
import { consentHandler } from "./consent.ts";
import type { Env } from "./env.ts";

/** Core telling anyone which library this is; nothing else is asked of it. */
const env = {
	APP_URL: "https://lib.example.org",
	SELF_URL: "https://mcp.lib.example.org",
	CORE: {
		fetch: async () => Response.json({ name: "Elm Street", type: "books" }),
	},
} as unknown as Env;

const get = (path: string) =>
	consentHandler.fetch!(
		new Request(`https://mcp.lib.example.org${path}`) as never,
		env,
		{} as ExecutionContext,
	);

describe("the MCP host's own pages", () => {
	it("says what it is to a person who opens it", async () => {
		const response = await get("/");
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Elm Street — MCP server");
	});

	it("does not pretend to have files it does not", async () => {
		for (const path of [
			"/.well-known/openid-configuration",
			"/.well-known/agent-card.json",
			"/anything",
		]) {
			expect((await get(path)).status, path).toBe(404);
		}
	});

	it("hands an agent the server card", async () => {
		const response = await get("/.well-known/mcp/server-card.json");
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		const card = (await response.json()) as Record<string, any>;
		expect(card.name).toBe("org.example/lib");
		expect(card.serverInfo).toMatchObject({
			name: "community-distributed-library",
			title: "Elm Street",
		});
		expect(card.transport.endpoint).toBe("https://mcp.lib.example.org/mcp");
		expect(card.remotes).toEqual([
			{ type: "streamable-http", url: "https://mcp.lib.example.org/mcp" },
		]);
		expect(card.description).toContain("lending library of books");
	});

	it("keeps crawlers to the discovery files", async () => {
		const response = await get("/robots.txt");
		expect(await response.text()).toBe(
			"User-agent: *\nContent-Signal: search=no, ai-input=no, ai-train=no\nAllow: /.well-known/\nDisallow: /\n",
		);
	});
});
