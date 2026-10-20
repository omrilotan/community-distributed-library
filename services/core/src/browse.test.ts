import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { as, NOA, SAM, WORK } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";

type Page = {
	results: { work: { id: string; title: string } }[];
	total: number;
	nextOffset: number | null;
};
const browse = async (who: string, query: string) =>
	(await as(who).get(`/v1/browse?${query}`)).body as Page;
const works = (page: Page) => page.results.map((entry) => entry.work.id);

afterEach(async () => {
	await env.DB.prepare(
		"UPDATE members SET area_lat = 51.6, area_lng = -0.19 WHERE id = ?",
	)
		.bind(NOA)
		.run();
});

/** Noa lists `count` books straight into the database, oldest first. */
async function shelve(count: number, title = (n: number) => `Book ${n}`) {
	const ids: string[] = [];
	const statements = [];
	for (let n = 1; n <= count; n += 1) {
		const id = `01M0BULK${String(n).padStart(18, "0")}`;
		ids.push(id);
		statements.push(
			env.DB.prepare(
				"INSERT INTO works (id, title, authors, search_key, created_at) VALUES (?, ?, '[\"Bulk\"]', ?, ?)",
			).bind(id, title(n), `book ${n} bulk`, n),
			env.DB.prepare(
				"INSERT INTO editions (id, work_id, title, search_key, created_at) VALUES (?, ?, ?, ?, ?)",
			).bind(id, id, title(n), `book ${n} bulk`, n),
			env.DB.prepare(
				`INSERT INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, created_at)
				 VALUES (?, ?, ?, 'shelved', ?, 'good', 'lendable', 0, ?)`,
			).bind(id, id, NOA, NOA, 1000 + n),
			env.DB.prepare(
				"INSERT INTO copy_shares (copy_id, community_id) VALUES (?, ?)",
			).bind(id, FINCH),
		);
	}
	for (let at = 0; at < statements.length; at += 400)
		await env.DB.batch(statements.slice(at, at + 400));
	return ids;
}

describe("browsing the shelves", () => {
	it("reaches every book, however many there are", async () => {
		const listed = await shelve(
			451,
			(n) => `Book ${String(n).padStart(3, "0")}`,
		);
		const seen: string[] = [];
		let offset: number | null = 0;
		let total = 0;
		while (offset !== null) {
			const page = await browse(SAM, `limit=240&offset=${offset}`);
			seen.push(...works(page));
			total = page.total;
			offset = page.nextOffset;
		}
		// Noa's 451 and Dana's Oz.
		expect(total).toBe(452);
		expect(new Set(seen).size).toBe(452);
		for (const id of listed) expect(seen).toContain(id);
		const byTitle = await browse(SAM, "limit=2&sort=title");
		expect(byTitle.results.map((entry) => entry.work.title)).toEqual([
			"Book 001",
			"Book 002",
		]);
	});

	it("counts books, not the page, and keeps newest first", async () => {
		const [older, newer] = await shelve(2, (n) =>
			n === 1 ? "Older" : "Newer",
		);
		const first = await browse(SAM, "limit=1");
		expect(first.results).toHaveLength(1);
		expect(first.total).toBe(3);
		expect(first.nextOffset).toBe(1);
		expect(works(await browse(SAM, "limit=240"))).toEqual([newer, older, WORK]);
		// Noa lives nearer Sam than Dana does: her books come first by distance.
		expect(works(await browse(SAM, "limit=240&sort=distance")).at(-1)).toBe(
			WORK,
		);
	});

	it("leaves out books further away than asked", async () => {
		const [far] = await shelve(1);
		await env.DB.prepare(
			"UPDATE members SET area_lat = 51.70, area_lng = -0.19 WHERE id = ?",
		)
			.bind(NOA)
			.run();
		expect(works(await browse(SAM, "limit=240"))).toContain(far);
		const near = await browse(SAM, "limit=240&within=1000");
		expect(works(near)).not.toContain(far);
		expect(works(near)).toContain(WORK);
		expect(near.total).toBe(1);
	});
});

describe("searching", () => {
	it("takes % and _ as characters, not wildcards", async () => {
		await shelve(2);
		const search = async (q: string) =>
			(await as(SAM).get(`/v1/search?q=${encodeURIComponent(q)}&limit=240`))
				.body.total as number;
		expect(await search("_")).toBe(0);
		expect(await search("%")).toBe(0);
		expect(await search("book 1")).toBeGreaterThan(0);
	});

	it("finds a Hebrew word ending in a final letter for moderators too", async () => {
		const { DANA } = await import("../test/api.ts");
		await as(NOA).post("/v1/copies", {
			manual: { title: "אגדות ילדים", authors: ["מחבר"] },
		});
		const found = await as(DANA).get(
			`/v1/admin/copies?q=${encodeURIComponent("ילדים")}`,
		);
		expect(
			found.body.copies.map((copy: { title: string }) => copy.title),
		).toContain("אגדות ילדים");
	});

	it("lists a set lent to two people once for moderators", async () => {
		const { DANA, COPY_B } = await import("../test/api.ts");
		await env.DB.prepare("UPDATE copies SET quantity = 6 WHERE id = ?")
			.bind(COPY_B)
			.run();
		await as(SAM).post("/v1/loans", { copyId: COPY_B, quantity: 2 });
		await as(NOA).post("/v1/loans", { copyId: COPY_B, quantity: 2 });
		const listed = (await as(DANA).get("/v1/admin/copies")).body.copies.filter(
			(copy: { id: string }) => copy.id === COPY_B,
		);
		expect(listed).toHaveLength(1);
	});
});
