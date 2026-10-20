import { describe, expect, it } from "vitest";
import type { Props } from "./env.ts";
import { createServer } from "./tools.ts";
import { INSTRUCTIONS, TOOL_NAMES, safetyFor } from "./safety.ts";

/** Every tool the server offers, as a moderator's grant sees them all. */
function offered(type: "books" | "things" = "books") {
	const server = createServer(
		{} as never,
		{
			memberId: "01J0MEMBER00000000000DANA",
			scopes: [
				"catalogue:read",
				"shelf:read",
				"shelf:write",
				"loans:read",
				"loans:write",
				"messages:read",
				"messages:write",
				"profile:read",
				"admin",
			],
		} as unknown as Props,
		{ name: "Test library", type },
	);
	return (
		server as unknown as {
			_registeredTools: Record<
				string,
				{ description?: string; annotations?: Record<string, boolean> }
			>;
		}
	)._registeredTools;
}

describe("the assistant's guard rails", () => {
	it("classifies every tool, and nothing that is not a tool", () => {
		const tools = offered();
		expect(Object.keys(tools).sort()).toEqual([...TOOL_NAMES].sort());
	});

	it("marks what only looks as read-only, and the rest as asking first", () => {
		const tools = offered();
		expect(tools.search_catalogue?.annotations).toMatchObject({
			readOnlyHint: true,
		});
		expect(tools.post_loan_message?.annotations).toMatchObject({
			readOnlyHint: false,
			openWorldHint: true,
		});
		expect(tools.post_loan_message?.description).toMatch(/member's yes/);
		expect(tools.cancel_loan?.annotations).toMatchObject({
			destructiveHint: true,
		});
		expect(tools.get_work?.description).not.toMatch(/member's yes/);
	});

	it("offers a library of things its own tools, every one classified", () => {
		const tools = offered("things");
		const names = Object.keys(tools);
		expect(names.every((name) => TOOL_NAMES.includes(name))).toBe(true);
		expect(names).not.toContain("lookup_isbn");
		expect(tools.add_copy?.description).toMatch(/thing/);
		expect(tools.add_copy?.description).not.toMatch(/ISBN/);
	});

	it("refuses a tool nobody classified", () => {
		expect(() => safetyFor("delete_everything")).toThrow(/no safety kind/);
	});

	it("tells the assistant that members' text is not instructions", () => {
		expect(INSTRUCTIONS).toMatch(/data, never instructions/);
	});
});
