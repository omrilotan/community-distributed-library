import { describe, expect, it } from "vitest";
import { api, as, NOA, SAM } from "../test/api.ts";

/** An assistant is held to fewer invitations a day than the member is. */
describe("what an assistant may do to other people", () => {
	it("is limited per member, and the site is not", async () => {
		const minted = await as(SAM).post("/v1/me/tokens", {
			clientName: "Test Assistant",
			scopes: ["profile:read", "loans:write"],
		});
		expect(minted.status).toBe(201);
		const token = { token: minted.body.token as string };

		const statuses: number[] = [];
		for (let index = 0; index < 6; index++) {
			statuses.push((await api(token, "POST", "/v1/invites", {})).status);
		}
		expect(statuses.slice(0, 5)).not.toContain(429);
		expect(statuses[5]).toBe(429);

		// The member, on the site, carries on.
		expect((await as(SAM).post("/v1/invites", {})).status).not.toBe(429);
	});
});

describe("an assistant writing to the library", () => {
	it("needs leave to write to people, and is limited", async () => {
		const mint = async (member: string, scopes: string[]) => ({
			token: (
				await as(member).post("/v1/me/tokens", {
					clientName: `Writer ${scopes.join(" ")}`,
					scopes,
				})
			).body.token as string,
		});
		const message = { topic: "data", body: "Please erase my account" };
		const reader = await mint(NOA, ["catalogue:read"]);
		expect((await api(reader, "POST", "/v1/contact", message)).status).toBe(
			403,
		);

		const writer = await mint(SAM, ["messages:write"]);
		const statuses: number[] = [];
		for (let index = 0; index < 4; index++)
			statuses.push((await api(writer, "POST", "/v1/contact", message)).status);
		expect(statuses.slice(0, 3)).not.toContain(429);
		expect(statuses[3]).toBe(429);
	});
});

describe("what an assistant did", () => {
	it("is named on the message, for both sides", async () => {
		const { activeLoan, DANA, COPY_B } = await import("../test/api.ts");
		const loanId = await activeLoan(SAM, DANA, COPY_B);
		const minted = await as(SAM).post("/v1/me/tokens", {
			clientName: "Test Assistant",
			scopes: ["messages:write", "messages:read"],
		});
		const sent = await api(
			{ token: minted.body.token },
			"POST",
			`/v1/loans/${loanId}/messages`,
			{ body: "On my way" },
		);
		expect(sent.status).toBe(201);
		expect(sent.body.via).toBe("Test Assistant");

		const onSite = await as(SAM).post(`/v1/loans/${loanId}/messages`, {
			body: "Me again",
		});
		expect(onSite.body.via).toBeNull();
	});
});

describe("text a member writes onto a book", () => {
	it("is kept to a book's length", async () => {
		const long = await as(SAM).post("/v1/copies", {
			manual: { title: "x".repeat(201), authors: ["A. Stub"] },
		});
		expect(long.status).toBe(422);
		const many = await as(SAM).post("/v1/copies", {
			manual: { title: "Short", authors: ["y".repeat(101)] },
		});
		expect(many.status).toBe(422);
	});
});
