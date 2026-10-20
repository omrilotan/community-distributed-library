import { describe, expect, it } from "vitest";
import type { Env, Props } from "./env.ts";
import { createServer } from "./tools.ts";
import { instructionsFor, TOOL_NAMES } from "./safety.ts";

const SCOPES = [
	"catalogue:read",
	"shelf:read",
	"shelf:write",
	"loans:read",
	"loans:write",
	"messages:read",
	"messages:write",
	"profile:read",
	"admin",
];

/** A server for a library of things, over a core that records what it is asked. */
function thingsServer() {
	const asked: { method: string; path: string; body: unknown }[] = [];
	const env = {
		APP_URL: "https://library.example.org",
		CORE: {
			fetch: async (request: Request) => {
				const url = new URL(request.url);
				const body = request.body ? await request.json() : null;
				asked.push({ method: request.method, path: url.pathname, body });
				return request.method === "PATCH"
					? new Response(null, { status: 204 })
					: Response.json(
							{ id: "01J0COPY", workId: "01J0WORK" },
							{ status: 201 },
						);
			},
		},
	} as unknown as Env;
	const server = createServer(
		env,
		{
			memberId: "01J0MEMBER00000000000DANA",
			scopes: SCOPES,
			coreToken: "t",
		} as unknown as Props,
		{ name: "Staging", type: "things" },
	);
	const tools = (
		server as unknown as {
			_registeredTools: Record<
				string,
				{
					description?: string;
					handler: (input: unknown, extra: unknown) => Promise<unknown>;
				}
			>;
		}
	)._registeredTools;
	const use = (name: string, input: unknown) => tools[name]!.handler(input, {});
	return { tools, asked, use };
}

describe("the assistant in a library of things", () => {
	it("is told it serves a library of things", () => {
		expect(instructionsFor("things")).toMatch(/library of things/);
		expect(instructionsFor("things")).not.toMatch(/\bbooks?\b/i);
	});

	it("offers classified tools that never speak of books, covers or ISBNs", () => {
		const { tools } = thingsServer();
		for (const [name, tool] of Object.entries(tools)) {
			expect(TOOL_NAMES).toContain(name);
			expect(tool.description, name).not.toMatch(
				/\bbooks?\b|\bcovers?\b|\bISBN|\bauthors?\b|\bshelf\b|\bshelves\b/i,
			);
		}
		expect(Object.keys(tools)).not.toContain("lookup_isbn");
	});

	it("adds a thing with its count, category and details", async () => {
		const { asked, use } = thingsServer();
		await use("add_copy", {
			name: "Folding chairs",
			quantity: 12,
			category: "party",
			brand: "Lifetime",
			included: "Carry bag",
			note: "Stacked in the shed",
		});
		expect(asked.at(-1)).toEqual({
			method: "POST",
			path: "/v1/copies",
			body: {
				thing: {
					name: "Folding chairs",
					quantity: 12,
					category: "party",
					details: { brand: "Lifetime", included: "Carry bag" },
				},
				note: "Stacked in the shed",
			},
		});
	});

	it("renames a thing, changes its count and details, and asks for part of a set", async () => {
		const { asked, use } = thingsServer();
		await use("update_copy", {
			copyId: "01J0COPY",
			name: "Garden chairs",
			quantity: 10,
			details: { brand: "Lifetime" },
		});
		expect(asked.at(-1)).toEqual({
			method: "PATCH",
			path: "/v1/copies/01J0COPY",
			body: {
				title: "Garden chairs",
				quantity: 10,
				details: { brand: "Lifetime" },
			},
		});
		await use("request_loan", { copyId: "01J0COPY", quantity: 4 });
		expect(asked.at(-1)).toEqual({
			method: "POST",
			path: "/v1/loans",
			body: { copyId: "01J0COPY", quantity: 4 },
		});
		await use("set_lend_limit", { things: 3 });
		expect(asked.at(-1)).toEqual({
			method: "PATCH",
			path: "/v1/me",
			body: { lendLimit: 3 },
		});
	});
});
