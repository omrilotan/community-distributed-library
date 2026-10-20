import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Props } from "./env.ts";
import { registerModeratorTools } from "./moderator-tools.ts";

/** Records what gets registered, and what each tool asks core for. */
function harness(scopes: string[]) {
	const tools = new Map<string, (input: any) => Promise<unknown>>();
	const server = {
		registerTool: (name: string, _config: unknown, handler: any) => {
			tools.set(name, handler);
		},
	} as unknown as McpServer;
	const calls: { path: string; method: string; body: unknown }[] = [];
	const call = async (path: string, init: any = {}) => {
		calls.push({ path, method: init.method ?? "GET", body: init.body });
		return { status: 200, body: { ok: true } as any };
	};
	const upload = async () => ({
		status: 201,
		body: { coverUrl: "https://covers.test/01J0COVER.jpg" },
	});
	const result = (text: string) => ({
		content: [{ type: "text" as const, text }],
	});
	const run = async (promise: Promise<{ status: number; body: unknown }>) => {
		const { status, body } = await promise;
		return result(`${status} ${JSON.stringify(body)}`);
	};
	const fail = (status: number) => ({ ...result(`${status}`), isError: true });
	registerModeratorTools(server, { scopes } as unknown as Props, {
		call: call as any,
		upload,
		run,
		fail,
	});
	return { tools, calls };
}

describe("moderator tools over MCP", () => {
	it("are not there for a member's assistant", () => {
		const { tools } = harness(["catalogue:read", "shelf:write"]);
		expect(tools.size).toBe(0);
	});

	it("are there for a moderator's", () => {
		const { tools } = harness(["catalogue:read", "admin"]);
		expect([...tools.keys()].sort()).toEqual(
			[
				"add_tag",
				"edit_item",
				"edit_tag",
				"remove_item_cover",
				"remove_tag",
				"rename_tag_group",
				"set_item_cover",
				"upload_item_cover",
			].sort(),
		);
	});

	it("edit any book through the moderator route", async () => {
		const { tools, calls } = harness(["admin"]);
		await tools.get("edit_item")!({
			workId: "W1",
			title: "Fixed",
			note: null,
		});
		expect(calls).toEqual([
			{
				path: "/v1/admin/works/W1",
				method: "PATCH",
				body: { title: "Fixed", note: null },
			},
		]);
	});

	it("set, upload and remove a cover", async () => {
		const { tools, calls } = harness(["admin"]);
		await tools.get("set_item_cover")!({
			workId: "W1",
			imageUrl: "https://example.test/cover.jpg",
		});
		await tools.get("upload_item_cover")!({
			workId: "W1",
			imageBase64: "iVBORw0KGgoAAAANSUhEUg==",
		});
		await tools.get("remove_item_cover")!({ workId: "W1" });
		expect(calls.map((one) => one.body)).toEqual([
			{ coverUrl: "https://example.test/cover.jpg" },
			{ coverUrl: "https://covers.test/01J0COVER.jpg" },
			{ coverUrl: null },
		]);
		expect(new Set(calls.map((one) => one.path))).toEqual(
			new Set(["/v1/admin/works/W1"]),
		);
	});

	it("keep the vocabulary", async () => {
		const { tools, calls } = harness(["admin"]);
		const labels = { en: "Winter", he: "חורף" };
		await tools.get("add_tag")!({
			namespace: "season",
			value: "winter",
			labels,
		});
		await tools.get("edit_tag")!({ tag: "season:winter", labels });
		await tools.get("remove_tag")!({ tag: "season:winter" });
		await tools.get("rename_tag_group")!({ namespace: "season", labels });
		expect(calls.map(({ path, method }) => `${method} ${path}`)).toEqual([
			"POST /v1/admin/tags",
			"PATCH /v1/admin/tags/season%3Awinter",
			"DELETE /v1/admin/tags/season%3Awinter",
			"PATCH /v1/admin/tag-namespaces/season",
		]);
	});
});
