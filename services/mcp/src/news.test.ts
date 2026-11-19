import { describe, expect, it } from "vitest";
import type { Env, Props } from "./env.ts";
import { newsLine } from "./news.ts";
import { createServer } from "./tools.ts";

/**
 * The server as an assistant gets it, with a core that answers every call
 * and has `counts` waiting as news until it is asked once.
 */
function connected(counts: Record<string, number>, hintStatus = 200) {
	const asked: string[] = [];
	let waiting = counts;
	const env = {
		APP_URL: "http://app.test",
		SELF_URL: "http://mcp.test",
		CORE: {
			fetch: async (request: Request) => {
				const { pathname } = new URL(request.url);
				asked.push(`${request.method} ${pathname}`);
				if (pathname === "/v1/me/news/hint") {
					const said = waiting;
					waiting = {};
					return Response.json(
						hintStatus === 200 ? { counts: said } : { title: "Forbidden" },
						{ status: hintStatus },
					);
				}
				if (pathname === "/v1/me/news")
					return Response.json({
						news: [
							{
								kind: "loan_request",
								detail: null,
								title: "Oz",
								url: "http://app.test/loans/01J0LXAN000000000000000001",
								loanId: "01J0LXAN000000000000000001",
								workId: null,
								at: 1,
							},
						],
						until: 7,
						more: false,
					});
				if (pathname === "/v1/me/news/seen")
					return new Response(null, { status: 204 });
				if (pathname === "/v1/works/missing")
					return Response.json({ title: "Not found" }, { status: 404 });
				return Response.json({ ok: true });
			},
		},
	} as unknown as Env;
	const server = createServer(
		env,
		{ memberId: "M", scopes: ["loans:read"], coreToken: "t" } as Props,
		{ name: "Test library", type: "books" },
	);
	const tools = (
		server as unknown as {
			_registeredTools: Record<
				string,
				{
					handler: (
						input: object,
						extra: object,
					) => Promise<{
						content: { text: string }[];
						isError?: boolean;
					}>;
				}
			>;
		}
	)._registeredTools;
	const use = (name: string, input: object = {}) =>
		tools[name]!.handler(input, {});
	return { use, asked };
}

describe("news at the end of a tool's answer", () => {
	it("counts what is new, once, after whatever was asked", async () => {
		const { use } = connected({ loan_request: 1, loan_message: 2 });
		const first = await use("my_profile");
		expect(first.content).toHaveLength(2);
		expect(first.content[1]!.text).toBe(
			"Also new for the member since they last looked: 1 loan request, 2 loan messages. Tell them, and call whats_new for what each one is.",
		);
		// The tool's own answer is untouched, and still first.
		expect(JSON.parse(first.content[0]!.text)).toEqual({ ok: true });
		expect((await use("my_profile")).content).toHaveLength(1);
	});

	it("says nothing when nothing is new", async () => {
		const { use } = connected({});
		expect((await use("list_my_loans")).content).toHaveLength(1);
	});

	it("leaves a failed answer alone, and does not spend the count on it", async () => {
		const { use, asked } = connected({ loan_request: 1 });
		const failed = await use("get_work", { workId: "missing" });
		expect(failed.isError).toBe(true);
		expect(failed.content).toHaveLength(1);
		expect(asked).not.toContain("POST /v1/me/news/hint");
		expect((await use("my_profile")).content).toHaveLength(2);
	});

	it("never breaks a tool when the count cannot be had", async () => {
		const { use } = connected({ loan_request: 1 }, 403);
		const answer = await use("my_profile");
		expect(answer.isError).toBeUndefined();
		expect(answer.content).toHaveLength(1);
	});
});

describe("whats_new", () => {
	it("lists the news, marks it read, and adds no count of its own", async () => {
		const { use, asked } = connected({ loan_request: 1 });
		const answer = await use("whats_new");
		expect(answer.content).toHaveLength(1);
		const body = JSON.parse(answer.content[0]!.text);
		expect(body.news[0]).toMatchObject({ kind: "loan_request", title: "Oz" });
		expect(body.more).toBe(false);
		expect(asked).toEqual(["GET /v1/me/news", "POST /v1/me/news/seen"]);
	});
});

describe("the line itself", () => {
	it("is in words, singular and plural, and names nothing a member wrote", () => {
		expect(newsLine({})).toBeNull();
		expect(newsLine({ handoff: 1 })).toMatch(/1 handover update\./);
		expect(newsLine({ report: 3 })).toMatch(/3 reports for the moderators/);
		// A kind this server does not know yet is still counted.
		expect(newsLine({ something_new: 2 })).toMatch(/2 other notices/);
	});
});
