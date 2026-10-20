import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { activeLoan, as, COPY_A, COPY_B, DANA, NOA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";

const setStatus = (member: string, status: "active" | "suspended") =>
	env.DB.prepare(
		"UPDATE memberships SET status = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(status, member, FINCH)
		.run();

afterEach(async () => {
	await setStatus(DANA, "active");
	await setStatus(SAM, "active");
});

describe("a loan with a suspended member", () => {
	it("says so, and nobody can message or nudge them", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const loanOf = async () =>
			(await as(SAM).get("/v1/me/loans")).body.borrowing.find(
				(loan: { id: string }) => loan.id === id,
			);
		expect((await loanOf()).lender.suspended).toBe(false);
		expect(
			(await as(SAM).post(`/v1/loans/${id}/messages`, { body: "Hi" })).status,
		).toBe(201);

		await setStatus(DANA, "suspended");
		const loan = await loanOf();
		expect(loan.lender.suspended).toBe(true);
		expect(loan.borrower.suspended).toBe(false);

		const message = await as(SAM).post(`/v1/loans/${id}/messages`, {
			body: "Are you there?",
		});
		expect(message.status).toBe(409);
		expect(message.body.title).toBe("Member suspended");
		expect((await as(SAM).post(`/v1/loans/${id}/nudge`)).status).toBe(409);

		// The thread stays readable, and the moderators can still be told.
		expect((await as(SAM).get(`/v1/loans/${id}/messages`)).status).toBe(200);
		expect(
			(
				await as(SAM).post(`/v1/loans/${id}/report`, {
					kind: "other",
					body: "The owner was suspended; how do I return the book?",
				})
			).status,
		).toBe(201);

		// Back in good standing: talking resumes.
		await setStatus(DANA, "active");
		expect(
			(await as(SAM).post(`/v1/loans/${id}/messages`, { body: "Hello" }))
				.status,
		).toBe(201);
	});
});

describe("the loans of a suspended member", () => {
	it("are the moderators' to see and settle", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const items = async () =>
			(await as(DANA).get("/v1/admin/attention")).body.items as {
				kind: string;
				loanId: string;
				suspendedName: string | null;
				loanStatus: string | null;
			}[];
		const moderation = async () =>
			(await as(DANA).get("/v1/me")).body.moderation as number;
		const before = await moderation();
		expect((await items()).some((item) => item.loanId === id)).toBe(false);

		await setStatus(SAM, "suspended");
		const item = (await items()).find((entry) => entry.loanId === id);
		expect(item).toMatchObject({ kind: "suspended", loanStatus: "active" });
		expect(item?.suspendedName).toBeTruthy();
		expect(await moderation()).toBe(before + 1);

		// Only a moderator, and only the outcome that fits the loan.
		expect(
			(
				await as(NOA).post(`/v1/admin/loans/${id}/close`, {
					outcome: "returned",
				})
			).status,
		).toBe(403);
		expect(
			(
				await as(DANA).post(`/v1/admin/loans/${id}/close`, {
					outcome: "cancelled",
				})
			).status,
		).toBe(409);
		expect(
			(
				await as(DANA).post(`/v1/admin/loans/${id}/close`, {
					outcome: "returned",
				})
			).status,
		).toBe(204);

		const copy = await env.DB.prepare(
			"SELECT state, holder_id FROM copies WHERE id = ?",
		)
			.bind(COPY_B)
			.first();
		expect(copy).toMatchObject({ state: "shelved", holder_id: DANA });
		const loan = await env.DB.prepare(
			"SELECT status, outcome FROM loans WHERE id = ?",
		)
			.bind(id)
			.first();
		expect(loan).toMatchObject({ status: "completed", outcome: "returned" });
		expect((await items()).some((entry) => entry.loanId === id)).toBe(false);
		expect(await moderation()).toBe(before);
	});

	it("leaves every other loan between its two members", async () => {
		const requested = await as(NOA).post("/v1/loans", { copyId: COPY_A });
		expect(requested.status).toBe(201);
		expect(
			(
				await as(DANA).post(`/v1/admin/loans/${requested.body.id}/close`, {
					outcome: "cancelled",
				})
			).status,
		).toBe(409);
	});
});

describe("a suspended member's shelf and place in the queue", () => {
	it("their books are not listed, and cannot be asked for", async () => {
		await setStatus(DANA, "suspended");
		const listed = await as(SAM).get("/v1/browse?limit=240");
		expect(
			listed.body.results.flatMap((work: { copies: { id: string }[] }) =>
				work.copies.map((copy) => copy.id),
			),
		).not.toContain(COPY_B);
		expect((await as(SAM).post("/v1/loans", { copyId: COPY_B })).status).toBe(
			409,
		);
	});

	it("a copy held for them goes to the next in line", async () => {
		const ADMIN =
			"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = ?";
		await env.DB.prepare(ADMIN).bind("admin", DANA, FINCH).run();
		try {
			const id = await activeLoan(NOA, DANA, COPY_B);
			await activeLoan(NOA, DANA, COPY_A);
			await as(SAM).post("/v1/waitlist", {
				workId: "01J0WRK0000000000000000ZZ0",
			});
			await env.DB.prepare(
				`INSERT INTO members (id, email, display_name, locale, created_at)
				 VALUES ('01J0MEMBER000000000000ELI0', 'eli@example.com', 'Eli', 'en', 1)`,
			).run();
			await env.DB.prepare(
				`INSERT INTO memberships (member_id, community_id, role, status, joined_at)
				 VALUES ('01J0MEMBER000000000000ELI0', ?, 'member', 'active', 1)`,
			)
				.bind(FINCH)
				.run();
			await as("01J0MEMBER000000000000ELI0").post("/v1/waitlist", {
				workId: "01J0WRK0000000000000000ZZ0",
			});
			await env.DB.prepare(
				"UPDATE waitlist SET created_at = created_at + 10 WHERE member_id = ?",
			)
				.bind("01J0MEMBER000000000000ELI0")
				.run();
			await as(DANA).post(`/v1/loans/${id}/returned`);
			await new Promise((resolve) => setTimeout(resolve, 40));
			const offer = (who: string) =>
				env.DB.prepare(
					"SELECT offered_copy_id AS copy FROM waitlist WHERE member_id = ?",
				)
					.bind(who)
					.first<{ copy: string | null }>();
			expect((await offer(SAM))?.copy).toBe(COPY_B);

			expect(
				(
					await as(DANA).post(`/v1/admin/members/${SAM}/status`, {
						status: "suspended",
					})
				).status,
			).toBe(204);
			await new Promise((resolve) => setTimeout(resolve, 40));
			expect((await offer(SAM))?.copy).toBeNull();
			expect((await offer("01J0MEMBER000000000000ELI0"))?.copy).toBe(COPY_B);
		} finally {
			await env.DB.prepare(ADMIN).bind("moderator", DANA, FINCH).run();
		}
	});
});
