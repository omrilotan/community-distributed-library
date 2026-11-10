import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { as, COPY_A, COPY_B, DANA, NOA, SAM } from "../test/api.ts";

const COPY_C = "01J0KPYC00000000000000000C";

/** A third copy of Dana's, so a group can grow after its time is set. */
async function thirdCopy() {
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, created_at)
			 VALUES (?1, '01J0EDTN0000000000000000ZZ', ?2, 'shelved', ?2, 'good', 'lendable', 0, 2)`,
		).bind(COPY_C, DANA),
		env.DB.prepare(
			"INSERT INTO copy_shares (copy_id, community_id) VALUES (?, '01J0COMMUNITY0000000FINCH')",
		).bind(COPY_C),
	]);
}

/** Sam asks Dana for each copy; Dana accepts them all in one go. */
async function accepted(...copies: string[]) {
	const ids: string[] = [];
	for (const copyId of copies)
		ids.push((await as(SAM).post("/v1/loans", { copyId })).body.id);
	const [first, ...also] = ids;
	expect(
		(await as(DANA).post(`/v1/loans/${first}/accept`, { also })).status,
	).toBe(204);
	// Index by the copies asked for: each one is there.
	return ids as [string, string, string];
}

const loan = async (id: string) =>
	(await env.DB.prepare(
		"SELECT status, started_at, due_at FROM loans WHERE id = ?",
	)
		.bind(id)
		.first<{ status: string; started_at: number; due_at: number }>())!;

const handoff = async (id: string) =>
	(await env.DB.prepare(
		"SELECT status, day, period, code FROM handoffs WHERE loan_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
	)
		.bind(id)
		.first<{
			status: string;
			day: string;
			period: string;
			code: string | null;
		}>()) ?? null;

describe("loans between the same two people", () => {
	it("are accepted in one go", async () => {
		const ids = await accepted(COPY_A, COPY_B);
		for (const id of ids) expect((await loan(id)).status).toBe("accepted");
	});

	it("meet once: one time, one code, one due date", async () => {
		const [a, b] = await accepted(COPY_A, COPY_B);
		// Dana's copy says a week; the other goes by the library's length.
		await as(DANA).patch(`/v1/copies/${COPY_A}`, { loanDays: 7 });

		const slot = { day: "2099-01-01", period: "evening" };
		expect(
			(await as(SAM).post(`/v1/loans/${a}/handoff/propose`, slot)).status,
		).toBe(201);
		expect(await handoff(b)).toMatchObject({ status: "proposed", ...slot });

		expect((await as(DANA).post(`/v1/loans/${b}/handoff/confirm`)).status).toBe(
			204,
		);
		const [one, two] = [await handoff(a), await handoff(b)];
		expect(one?.status).toBe("agreed");
		expect(two?.status).toBe("agreed");
		expect(one?.code).toBe(two?.code);

		expect(
			(
				await as(SAM).post(`/v1/loans/${a}/handoff/complete`, {
					code: one?.code,
				})
			).status,
		).toBe(204);
		const [first, second] = [await loan(a), await loan(b)];
		expect(first.status).toBe("active");
		expect(second.status).toBe("active");
		expect(first.due_at).toBe(second.due_at);
		// The longer of the two: nobody's book comes back sooner than allowed.
		expect((first.due_at - first.started_at) / 86_400).toBeGreaterThan(7);
	});

	it("call the meeting off together", async () => {
		const [a, b] = await accepted(COPY_A, COPY_B);
		await as(SAM).post(`/v1/loans/${a}/handoff/propose`, {
			day: "2099-01-01",
			period: "morning",
		});
		expect((await as(DANA).post(`/v1/loans/${b}/handoff/cancel`)).status).toBe(
			204,
		);
		expect((await handoff(a))?.status).toBe("cancelled");
		expect((await handoff(b))?.status).toBe("cancelled");
	});

	it("take one more along to a time already agreed", async () => {
		await thirdCopy();
		const [a, b] = await accepted(COPY_A, COPY_B);
		await as(SAM).post(`/v1/loans/${a}/handoff/propose`, {
			day: "2099-01-01",
			period: "afternoon",
		});
		await as(DANA).post(`/v1/loans/${a}/handoff/confirm`);
		const [c] = await accepted(COPY_C);
		const joined = await handoff(c!);
		expect(joined).toMatchObject({
			status: "agreed",
			day: "2099-01-01",
			period: "afternoon",
		});
		expect(joined?.code).toBe((await handoff(b!))?.code);
	});

	it("handed over in one go are due back on one day", async () => {
		const [a, b] = await accepted(COPY_A, COPY_B);
		await as(DANA).patch(`/v1/copies/${COPY_B}`, { loanDays: 3 });
		expect(
			(await as(DANA).post(`/v1/loans/${a}/handed`, { also: [b] })).status,
		).toBe(204);
		const [first, second] = [await loan(a!), await loan(b!)];
		expect(second.status).toBe("active");
		expect(first.due_at).toBe(second.due_at);
	});

	it("leave out a loan that is not the caller's", async () => {
		const [a] = await accepted(COPY_A);
		const theirs = (await as(NOA).post("/v1/loans", { copyId: COPY_B })).body
			.id;
		expect(
			(await as(SAM).post(`/v1/loans/${a}/handed`, { also: [theirs] })).status,
		).toBe(204);
		expect((await loan(theirs)).status).toBe("requested");
	});
});
