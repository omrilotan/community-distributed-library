import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import Convo from "./index.ts";

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);
const convo = () => new Convo(createExecutionContext(), env);

describe("a loan's thread", () => {
	it("keeps messages in the order they were posted, trimmed and cut short", async () => {
		const first = await convo().post("loan-a", "dana", "  Tuesday?  ");
		const second = await convo().post(
			"loan-a",
			"sam",
			"x".repeat(1200),
			"Claude".repeat(20),
		);
		expect(first).toMatchObject({ loanId: "loan-a", body: "Tuesday?" });
		expect(second.body).toHaveLength(1000);
		const thread = await convo().thread("loan-a");
		expect(thread.map((message) => message.id)).toEqual([first.id, second.id]);
		// Who it came through is kept short, as the database keeps it.
		expect(thread[1]!.via).toHaveLength(80);
		expect(await convo().thread("loan-b")).toEqual([]);
	});

	it("takes no empty message", async () => {
		await expect(convo().post("loan-a", "dana", "   ")).rejects.toThrow();
		expect(await convo().thread("loan-a")).toEqual([]);
	});

	it("counts what the others wrote since a moment, not the reader's own", async () => {
		await convo().post("loan-a", "dana", "Here it is");
		await convo().post("loan-a", "sam", "Thanks");
		await convo().post("loan-b", "dana", "And this one");
		const since = now() - 60;
		expect(
			await convo().unread("sam", [
				{ loanId: "loan-a", since },
				{ loanId: "loan-b", since },
				{ loanId: "loan-c", since },
			]),
		).toEqual({ "loan-a": 1, "loan-b": 1 });
		expect(
			await convo().unread("sam", [{ loanId: "loan-a", since: now() + 60 }]),
		).toEqual({});
		expect(await convo().unread("sam", [])).toEqual({});
	});
});

describe("one member's messages", () => {
	it("are all handed over for a copy of their data, and all go when they are forgotten", async () => {
		await convo().post("loan-a", "dana", "One");
		await convo().post("loan-b", "dana", "Two");
		await convo().post("loan-a", "sam", "Not hers");
		expect(
			(await convo().byAuthor("dana")).map((message) => message.body),
		).toEqual(["One", "Two"]);
		expect(await convo().eraseAuthor("dana")).toBe(2);
		expect(await convo().byAuthor("dana")).toEqual([]);
		expect(
			(await convo().thread("loan-a")).map((message) => message.body),
		).toEqual(["Not hers"]);
	});
});

describe("keeping threads", () => {
	it("drops a thread 90 days after its loan closed, and no sooner", async () => {
		await convo().post("long-closed", "dana", "Old news");
		await convo().post("just-closed", "dana", "Recent");
		await convo().post("still-open", "dana", "Ongoing");
		await convo().closed("long-closed", now() - 91 * DAY);
		await convo().closed("just-closed", now() - 89 * DAY);
		// A loan closed before anybody wrote still has its moment recorded.
		await convo().closed("never-written", now() - 91 * DAY);

		await convo().scheduled();

		expect(await convo().thread("long-closed")).toEqual([]);
		expect(await convo().thread("just-closed")).toHaveLength(1);
		expect(await convo().thread("still-open")).toHaveLength(1);
		const threads = await env.DB.prepare(
			"SELECT loan_id FROM threads ORDER BY loan_id",
		).all<{ loan_id: string }>();
		expect(threads.results.map((row) => row.loan_id)).toEqual([
			"just-closed",
			"still-open",
		]);
	});
});
