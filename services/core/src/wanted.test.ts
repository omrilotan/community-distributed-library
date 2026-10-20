import { describe, expect, it } from "vitest";
import { api, as, DANA, NOA, SAM, WORK } from "../test/api.ts";

describe("wanted books", () => {
	it("asking for a title creates the work, joins its queue, and lists it as wanted", async () => {
		const asked = await as(SAM).post("/v1/wanted", {
			title: "The Wind in the Willows",
			authors: ["Kenneth Grahame"],
		});
		expect(asked.status).toBe(201);
		expect(asked.body.position).toBe(1);

		// Same title again, different case: same work, same place in the queue.
		const again = await as(SAM).post("/v1/wanted", {
			title: "the wind in the willows",
			authors: ["kenneth grahame"],
		});
		expect(again.body.workId).toBe(asked.body.workId);

		const wanted = await as(DANA).get("/v1/wanted");
		expect(wanted.body.works).toEqual([
			expect.objectContaining({ workId: asked.body.workId, waiting: 1 }),
		]);

		const card = await api(null, "GET", `/v1/works/${asked.body.workId}/card`);
		expect(card.status).toBe(200);
		expect(card.body).toMatchObject({
			title: "The Wind in the Willows",
			copies: 0,
			waiting: 1,
		});
	});

	it("asking by ISBN goes through the metadata service", async () => {
		const asked = await as(SAM).post("/v1/wanted", { isbn13: "9780000000002" });
		expect(asked.status).toBe(201);
		const card = await api(null, "GET", `/v1/works/${asked.body.workId}/card`);
		expect(card.body.title).toBe("Stub Book");
		expect(
			(await as(SAM).post("/v1/wanted", { isbn13: "9780000000009" })).status,
		).toBe(404);
	});

	it("a title asked for without an author meets the copy listed with one", async () => {
		const asked = await as(SAM).post("/v1/wanted", {
			title: "Harry Potter",
			authors: [],
		});
		const listed = await as(DANA).post("/v1/copies", {
			manual: { title: "Harry Potter", authors: ["J. K. Rowling"] },
		});
		expect(listed.body.workId).toBe(asked.body.workId);
		const card = await api(null, "GET", `/v1/works/${asked.body.workId}/card`);
		expect(card.body.authors).toEqual(["J. K. Rowling"]);

		// And the other way round: a listing first, then a title-only ask.
		const askedLater = await as(NOA).post("/v1/wanted", { title: "oz" });
		expect(askedLater.body.workId).toBe(WORK);
	});

	it("the first copy listed is held for the asker, and the book leaves the wanted list", async () => {
		const asked = await as(SAM).post("/v1/wanted", {
			title: "Wanted Title",
			authors: [],
		});
		const listed = await as(DANA).post("/v1/copies", {
			manual: { title: "Wanted Title", authors: ["Anon"] },
		});
		expect(listed.status).toBe(201);
		expect(listed.body.workId).toBe(asked.body.workId);

		const entry = (await as(SAM).get("/v1/me/waitlist")).body.entries[0];
		expect(entry.offer?.copyId).toBe(listed.body.id);
		expect((await as(DANA).get("/v1/wanted")).body.works).toHaveLength(0);
		expect(
			(await as(NOA).post("/v1/loans", { copyId: listed.body.id })).status,
		).toBe(409);
	});

	it("a held copy can still be deleted by its owner; the hold is released", async () => {
		await as(SAM).post("/v1/waitlist", { workId: WORK });
		const listed = await as(DANA).post("/v1/copies", {
			manual: { title: "Oz", authors: ["Baum"] },
		});
		expect(
			(await as(SAM).get("/v1/me/waitlist")).body.entries[0].offer?.copyId,
		).toBe(listed.body.id);

		expect((await as(DANA).del(`/v1/copies/${listed.body.id}`)).status).toBe(
			204,
		);
		expect(
			(await as(SAM).get("/v1/me/waitlist")).body.entries[0].offer,
		).toBeNull();
	});
});

describe("asking for a book by its title alone", () => {
	it("finds only a book of that title, and makes no edition of it", async () => {
		const { as, SAM, NOA } = await import("../test/api.ts");
		const { env } = await import("cloudflare:test");
		const stamp = Date.now();
		const longer = await as(SAM).post("/v1/copies", {
			manual: { title: `Dune${stamp} Messiah`, authors: ["Frank Herbert"] },
		});
		const asked = await as(NOA).post("/v1/wanted", { title: `Dune${stamp}` });
		expect(asked.status).toBe(201);
		expect(asked.body.workId).not.toBe(longer.body.workId);

		// Asked twice more, by someone else too: still one work, no editions.
		await as(SAM).post("/v1/wanted", { title: `Dune${stamp}` });
		const again = await as(NOA).post("/v1/wanted", { title: `Dune${stamp}` });
		expect(again.body.workId).toBe(asked.body.workId);
		const editions = await env.DB.prepare(
			"SELECT count(*) AS n FROM editions WHERE work_id = ?",
		)
			.bind(asked.body.workId)
			.first<{ n: number }>();
		expect(editions?.n).toBe(0);
	});
});
