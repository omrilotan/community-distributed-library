import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { as, DANA, NOA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";

const becomes = (type: "books" | "things") =>
	env.DB.prepare("UPDATE communities SET type = ? WHERE id = ?")
		.bind(type, FINCH)
		.run();

afterEach(async () => {
	await becomes("books");
});

const copyRow = (id: string) =>
	env.DB.prepare("SELECT state, quantity, holder_id FROM copies WHERE id = ?")
		.bind(id)
		.first<{ state: string; quantity: number; holder_id: string }>();

describe("a set lent in part", () => {
	it("is shared out by count, and comes back by count", async () => {
		await becomes("things");
		const listed = await as(SAM).post("/v1/copies", {
			thing: { name: "Folding chairs", quantity: 12 },
		});
		const copyId = listed.body.id as string;
		const ask = (who: string, quantity: number) =>
			as(who).post("/v1/loans", { copyId, quantity });

		const dana = await ask(DANA, 6);
		expect(dana.status).toBe(201);
		expect(dana.body.relay).toBe(false);
		// Seven more than are free; six is just right.
		expect((await ask(NOA, 7)).status).toBe(409);
		const noa = await ask(NOA, 6);
		expect(noa.status).toBe(201);
		// One part of a set per neighbour at a time.
		expect((await ask(DANA, 1)).status).toBe(409);

		const free = async () => {
			const found = await as(DANA).get("/v1/search?q=folding");
			const copy = found.body.results
				.flatMap((entry: { copies: { id: string }[] }) => entry.copies)
				.find((entry: { id: string }) => entry.id === copyId);
			return copy as { free: number; available: boolean; quantity: number };
		};
		expect(await free()).toMatchObject({
			quantity: 12,
			free: 0,
			available: false,
		});

		// Both handed over: two loans of one copy out at once, the set on its shelf.
		for (const loan of [dana.body.id, noa.body.id]) {
			expect((await as(SAM).post(`/v1/loans/${loan}/accept`)).status).toBe(204);
			expect((await as(SAM).post(`/v1/loans/${loan}/handed`)).status).toBe(204);
		}
		const statuses = await env.DB.prepare(
			"SELECT status, quantity FROM loans WHERE copy_id = ? ORDER BY requested_at",
		)
			.bind(copyId)
			.all<{ status: string; quantity: number }>();
		expect(statuses.results).toEqual([
			{ status: "active", quantity: 6 },
			{ status: "active", quantity: 6 },
		]);
		expect(await copyRow(copyId)).toMatchObject({
			state: "shelved",
			holder_id: SAM,
		});

		const mine = (await as(DANA).get("/v1/me/loans")).body.borrowing.find(
			(loan: { id: string }) => loan.id === dana.body.id,
		);
		expect(mine).toMatchObject({ quantity: 6, copy: { quantity: 12 } });

		// Dana's six come back: six free again.
		expect(
			(await as(SAM).post(`/v1/loans/${dana.body.id}/returned`)).status,
		).toBe(204);
		expect((await free()).free).toBe(6);

		// Noa's six are lost: the set is six now, still on the shelf.
		expect(
			(
				await as(NOA).post(`/v1/loans/${noa.body.id}/report`, {
					kind: "loss",
				})
			).status,
		).toBe(201);
		expect(await copyRow(copyId)).toMatchObject({
			state: "shelved",
			quantity: 6,
		});
	});

	it("anything else is lent whole", async () => {
		await becomes("things");
		const listed = await as(SAM).post("/v1/copies", {
			thing: { name: "Ladder" },
		});
		expect(
			(
				await as(DANA).post("/v1/loans", {
					copyId: listed.body.id,
					quantity: 2,
				})
			).status,
		).toBe(422);
		expect(
			(await as(DANA).post("/v1/loans", { copyId: listed.body.id })).status,
		).toBe(201);
		expect(
			(await as(NOA).post("/v1/loans", { copyId: listed.body.id })).status,
		).toBe(409);
	});
});
