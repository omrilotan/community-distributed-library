import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { as, COPY_A, COPY_B, DANA, NOA, SAM, WORK } from "../test/api.ts";

/** A second book, so a filter has something to exclude. */
async function poetryByNoa() {
	const listed = await as(NOA).post("/v1/copies", {
		manual: { title: "Selected Poems", authors: ["Zelda"] },
	});
	await as(NOA).post(`/v1/works/${listed.body.workId}/tags`, {}); // no-op guard
	await as(NOA).put(`/v1/works/${listed.body.workId}/tags`, {
		tags: ["genre:poetry", "language:he", "audience:adult"],
	});
	return listed.body.workId as string;
}

describe("tags", () => {
	it("are set by anyone owning a copy, and refused to everyone else", async () => {
		expect(
			(
				await as(DANA).put(`/v1/works/${WORK}/tags`, {
					tags: ["genre:fiction", "audience:children"],
				})
			).status,
		).toBe(204);
		expect((await as(DANA).get(`/v1/works/${WORK}/tags`)).body.tags).toEqual([
			"audience:children",
			"genre:fiction",
		]);

		// Noa owns no copy of this work.
		const refused = await as(NOA).put(`/v1/works/${WORK}/tags`, {
			tags: ["genre:poetry"],
		});
		expect(refused.status).toBe(403);

		// A moderator may tag anything; Dana is one.
		expect(
			(
				await as(DANA).put(`/v1/works/${WORK}/tags`, {
					tags: ["genre:fiction"],
				})
			).status,
		).toBe(204);
	});

	it("are logged when a moderator sets them on a book they do not hold", async () => {
		const poetry = await poetryByNoa();
		expect(
			(
				await as(DANA).put(`/v1/works/${poetry}/tags`, {
					tags: ["genre:poetry"],
				})
			).status,
		).toBe(204);
		const logged = await env.DB.prepare(
			"SELECT actor_id, target FROM moderation_log WHERE action = 'PUT /v1/works/:id/tags'",
		).all();
		// Noa tagged her own book above; only Dana's change is a moderator's.
		expect(logged.results).toEqual([{ actor_id: DANA, target: poetry }]);
	});

	it("travel with the book: every copy of it carries the same tags", async () => {
		await as(DANA).put(`/v1/works/${WORK}/tags`, { tags: ["genre:fiction"] });
		const browse = await as(SAM).get("/v1/browse");
		for (const copy of browse.body.results) {
			if (copy.work.id === WORK)
				expect(copy.work.tags).toEqual(["genre:fiction"]);
		}
	});

	it("filter as facets: either inside a namespace, narrowing across them", async () => {
		await as(DANA).put(`/v1/works/${WORK}/tags`, {
			tags: ["genre:fiction", "language:en", "audience:children"],
		});
		const poetry = await poetryByNoa();

		const ids = async (query: string) =>
			(await as(SAM).get(`/v1/browse?${query}`)).body.results
				.map((copy: any) => copy.work.id)
				.filter(
					(id: string, index: number, all: string[]) =>
						all.indexOf(id) === index,
				);

		expect(await ids("tags=genre:fiction")).toEqual([WORK]);
		expect(await ids("tags=genre:poetry")).toEqual([poetry]);
		// Same namespace: either one.
		expect((await ids("tags=genre:fiction,genre:poetry")).sort()).toEqual(
			[WORK, poetry].sort(),
		);
		// Different namespaces: both must hold.
		expect(await ids("tags=genre:fiction,language:he")).toEqual([]);
		expect(await ids("tags=genre:poetry,language:he")).toEqual([poetry]);
		// `all` forces AND everywhere, `any` forces OR.
		expect(await ids("tags=genre:fiction,genre:poetry&match=all")).toEqual([]);
		expect(
			(await ids("tags=genre:fiction,language:he&match=any")).sort(),
		).toEqual([WORK, poetry].sort());
		// Unknown slugs are ignored rather than fatal.
		expect(await ids("tags=genre:westerns,genre:fiction")).toEqual([WORK]);
	});

	it("filter search as well as browse", async () => {
		await as(DANA).put(`/v1/works/${WORK}/tags`, { tags: ["genre:fiction"] });
		await poetryByNoa();
		const hit = await as(SAM).get("/v1/search?q=oz&tags=genre:fiction");
		expect(hit.body.results.length).toBeGreaterThan(0);
		const miss = await as(SAM).get("/v1/search?q=oz&tags=genre:poetry");
		expect(miss.body.results).toHaveLength(0);
	});

	it("count only what the community can see", async () => {
		await as(DANA).put(`/v1/works/${WORK}/tags`, {
			tags: ["genre:fiction", "language:en"],
		});
		const counts = (await as(SAM).get("/v1/tags")).body.counts;
		expect(counts).toContainEqual({ tag: "genre:fiction", works: 1 });
		expect(counts.find((c: any) => c.tag === "genre:poetry")).toBeUndefined();
	});

	it("seed the language from the metadata provider when listing by ISBN", async () => {
		const listed = await as(SAM).post("/v1/copies", {
			isbn13: "9780000000002",
		});
		expect(listed.status).toBe(201);
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(
			(await as(SAM).get(`/v1/works/${listed.body.workId}/tags`)).body.tags,
		).toEqual(["language:en"]);
	});
});

describe("lending limit", () => {
	it("stops new requests once the owner is fully lent out, without hiding the book", async () => {
		expect((await as(DANA).patch("/v1/me", { lendLimit: 1 })).status).toBe(204);
		expect((await as(DANA).get("/v1/me")).body.lendLimit).toBe(1);

		// One loan out is the whole allowance.
		const first = await as(SAM).post("/v1/loans", { copyId: COPY_A });
		expect(first.status).toBe(201);
		expect(
			(await as(DANA).post(`/v1/loans/${first.body.id}/accept`)).status,
		).toBe(204);

		const second = await as(NOA).post("/v1/loans", { copyId: COPY_B });
		expect(second.status).toBe(409);
		expect(second.body.title).toBe("Lending as many as they can");

		// Still listed, still visible, just not requestable.
		const copy = (await as(NOA).get("/v1/browse")).body.results
			.flatMap((listing: any) => listing.copies)
			.find((one: any) => one.id === COPY_B);
		expect(copy).toBeDefined();
		expect(copy.available).toBe(false);
		expect(copy.ownerAtLimit).toBe(true);

		// Returning the book frees the allowance again.
		await as(DANA).post(`/v1/loans/${first.body.id}/cancel`);
		expect((await as(NOA).post("/v1/loans", { copyId: COPY_B })).status).toBe(
			201,
		);
	});

	it("is lifted by clearing it", async () => {
		await as(DANA).patch("/v1/me", { lendLimit: 1 });
		await as(DANA).patch("/v1/me", { lendLimit: null });
		expect((await as(DANA).get("/v1/me")).body.lendLimit).toBeNull();
	});

	it("leaves the count alone when the profile changes for other reasons", async () => {
		await as(DANA).patch("/v1/me", { lendLimit: 3 });
		await as(DANA).patch("/v1/me", { displayName: "Dana R" });
		expect((await as(DANA).get("/v1/me")).body.lendLimit).toBe(3);
	});
});

describe("paging", () => {
	it("pages over books, so none appears on two pages", async () => {
		for (let index = 0; index < 4; index += 1) {
			await as(NOA).post("/v1/copies", {
				manual: { title: `Filler ${index}`, authors: ["Nobody"] },
			});
		}
		const first = await as(SAM).get("/v1/browse?limit=2");
		expect(first.body.results).toHaveLength(2);
		expect(first.body.nextOffset).toBe(2);

		const second = await as(SAM).get(
			`/v1/browse?limit=2&offset=${first.body.nextOffset}`,
		);
		const seen = new Set(
			first.body.results.map((listing: any) => listing.work.id),
		);
		for (const listing of second.body.results)
			expect(seen.has(listing.work.id)).toBe(false);
	});

	it("reports the end of the list as a null cursor", async () => {
		const all = await as(SAM).get("/v1/browse?limit=50");
		expect(all.body.nextOffset).toBeNull();
		const search = await as(SAM).get("/v1/search?q=oz&limit=50");
		expect(search.body.nextOffset).toBeNull();
	});

	it("keeps the filter while paging", async () => {
		await as(DANA).put(`/v1/works/${WORK}/tags`, { tags: ["genre:fiction"] });
		const page = await as(SAM).get("/v1/browse?limit=1&tags=genre:fiction");
		for (const listing of page.body.results) expect(listing.work.id).toBe(WORK);
	});
});

describe("what needs me", () => {
	it("counts requests to answer", async () => {
		expect((await as(DANA).get("/v1/me")).body.attention).toBe(0);
		await as(SAM).post("/v1/loans", { copyId: COPY_B });
		expect((await as(DANA).get("/v1/me")).body.attention).toBe(1);
		expect((await as(SAM).get("/v1/me")).body.attention).toBe(0);
	});
});

describe("the vocabulary", () => {
	it("ships as rows a moderator can read back, in label order", async () => {
		const vocab = (await as(SAM).get("/v1/tags")).body;
		expect(vocab.namespaces.map((one: any) => one.id)).toEqual([
			"language",
			"audience",
			"genre",
		]);
		expect(vocab.tags[0]).toMatchObject({
			slug: "language:he",
			labels: { en: "Hebrew", he: "עברית" },
			builtin: true,
		});
		expect(vocab.tags).toHaveLength(14);
	});

	it("refuses slugs it does not know, rather than inventing them", async () => {
		const put = await as(DANA).put(`/v1/works/${WORK}/tags`, {
			tags: ["genre:fiction", "genre:westerns"],
		});
		expect(put.status).toBe(204);
		expect((await as(DANA).get(`/v1/works/${WORK}/tags`)).body.tags).toEqual([
			"genre:fiction",
		]);
	});
});

describe("tag suggestions", () => {
	it("waits for a moderator, then lands on the book it came from", async () => {
		const proposed = await as(SAM).post("/v1/tags/proposals", {
			namespace: "genre",
			label: "Cookbooks",
			workId: WORK,
		});
		expect(proposed.status).toBe(201);

		// Nothing yet: not in the vocabulary, not on the book.
		expect(
			(await as(SAM).get("/v1/tags")).body.tags.some(
				(tag: any) => tag.slug === "genre:cookbooks",
			),
		).toBe(false);
		expect((await as(DANA).get(`/v1/works/${WORK}/tags`)).body.tags).toEqual(
			[],
		);
		// Moderators are told there is something to look at.
		expect((await as(DANA).get("/v1/me")).body.moderation).toBe(1);
		expect((await as(SAM).get("/v1/me")).body.moderation).toBe(0);

		const approved = await as(DANA).post(
			`/v1/admin/tag-proposals/${proposed.body.id}/approve`,
			{
				namespace: "genre",
				value: "cookbooks",
				labels: { en: "Cookbooks", he: "ספרי בישול" },
			},
		);
		expect(approved.status).toBe(201);
		expect(approved.body.tag).toBe("genre:cookbooks");

		// In the vocabulary, on the book, and usable as a filter.
		const vocab = (await as(SAM).get("/v1/tags")).body;
		expect(
			vocab.tags.find((tag: any) => tag.slug === "genre:cookbooks"),
		).toMatchObject({
			labels: { en: "Cookbooks", he: "ספרי בישול" },
			builtin: false,
		});
		expect((await as(DANA).get(`/v1/works/${WORK}/tags`)).body.tags).toEqual([
			"genre:cookbooks",
		]);
		const filtered = await as(SAM).get("/v1/browse?tags=genre:cookbooks");
		expect(filtered.body.results.length).toBeGreaterThan(0);
		expect(
			(await as(SAM).get("/v1/me/tag-proposals")).body.proposals[0],
		).toMatchObject({
			status: "approved",
			tag: "genre:cookbooks",
		});
	});

	it("can bring a whole new label with it", async () => {
		const proposed = await as(SAM).post("/v1/tags/proposals", {
			namespaceLabel: "Reading level",
			label: "Easy",
		});
		expect(proposed.status).toBe(201);
		const approved = await as(DANA).post(
			`/v1/admin/tag-proposals/${proposed.body.id}/approve`,
			{
				namespace: "level",
				namespaceLabels: { en: "Reading level", he: "רמת קריאה" },
				value: "easy",
				labels: { en: "Easy", he: "קל" },
			},
		);
		expect(approved.status).toBe(201);
		const vocab = (await as(SAM).get("/v1/tags")).body;
		expect(vocab.namespaces.map((one: any) => one.id)).toContain("level");
		expect(
			vocab.namespaces.find((one: any) => one.id === "level"),
		).toMatchObject({
			labels: { en: "Reading level", he: "רמת קריאה" },
			builtin: false,
		});
	});

	it("is declined with a word back, and nothing enters the vocabulary", async () => {
		const proposed = await as(SAM).post("/v1/tags/proposals", {
			namespace: "genre",
			label: "misc",
		});
		expect(
			(
				await as(DANA).post(
					`/v1/admin/tag-proposals/${proposed.body.id}/decline`,
					{
						note: "Too broad to be useful",
					},
				)
			).status,
		).toBe(204);
		expect((await as(SAM).get("/v1/tags")).body.tags).toHaveLength(14);
		expect(
			(await as(SAM).get("/v1/me/tag-proposals")).body.proposals[0],
		).toMatchObject({
			status: "declined",
			note: "Too broad to be useful",
		});
		// A decision is final; the same suggestion cannot be approved afterwards.
		expect(
			(
				await as(DANA).post(
					`/v1/admin/tag-proposals/${proposed.body.id}/approve`,
					{
						namespace: "genre",
						value: "misc",
						labels: { en: "Misc", he: "שונות" },
					},
				)
			).status,
		).toBe(404);
	});

	it("is for moderators to decide, not the member who suggested it", async () => {
		const proposed = await as(SAM).post("/v1/tags/proposals", {
			namespace: "genre",
			label: "Thrillers",
		});
		expect(
			(
				await as(SAM).post(
					`/v1/admin/tag-proposals/${proposed.body.id}/approve`,
					{
						namespace: "genre",
						value: "thrillers",
						labels: { en: "Thrillers", he: "מתח" },
					},
				)
			).status,
		).toBe(403);
		expect((await as(SAM).get("/v1/admin/tag-proposals")).status).toBe(403);
	});

	it("caps how many a member may have open at once", async () => {
		for (let index = 0; index < 10; index += 1) {
			const one = await as(SAM).post("/v1/tags/proposals", {
				namespace: "genre",
				label: `Idea ${index}`,
			});
			expect(one.status).toBe(201);
		}
		const eleventh = await as(SAM).post("/v1/tags/proposals", {
			namespace: "genre",
			label: "One too many",
		});
		expect(eleventh.status).toBe(409);
	});

	it("keeps a language's name, and refuses a name another tag has", async () => {
		const language = await as(DANA).patch("/v1/admin/tags/language:en", {
			value: "english",
		});
		expect(language.status).toBe(409);
		// Its labels are the moderators' to word.
		expect(
			(
				await as(DANA).patch("/v1/admin/tags/language:en", {
					labels: { en: "English", he: "אנגלית" },
				})
			).status,
		).toBe(200);
		const clash = await as(DANA).patch("/v1/admin/tags/genre:poetry", {
			value: "comics",
		});
		expect(clash.status).toBe(409);
	});

	it("renames a tag and the books carrying it follow", async () => {
		await as(DANA).put(`/v1/works/${WORK}/tags`, { tags: ["genre:fiction"] });
		const renamed = await as(DANA).patch("/v1/admin/tags/genre:fiction", {
			value: "novels",
			labels: { en: "Novels", he: "רומנים" },
		});
		expect(renamed.status).toBe(200);
		expect(renamed.body.tag).toBe("genre:novels");
		expect((await as(DANA).get(`/v1/works/${WORK}/tags`)).body.tags).toEqual([
			"genre:novels",
		]);
	});
});

describe("one tile per book", () => {
	it("gathers every copy of a title under it, nearest first", async () => {
		// Noa lists the same work Dana already has a copy of.
		const noaCopy = await as(NOA).post("/v1/copies", {
			manual: { title: "Oz", authors: ["Baum"] },
		});
		expect(noaCopy.status).toBe(201);
		expect(noaCopy.body.workId).toBe(WORK);

		const listings = (await as(SAM).get("/v1/browse")).body.results;
		const oz = listings.filter((one: any) => one.work.id === WORK);
		expect(oz).toHaveLength(1);
		expect(oz[0].copies.length).toBeGreaterThanOrEqual(3);
		expect(oz[0].available).toBe(oz[0].copies.length);

		const distances = oz[0].copies
			.map((copy: any) => copy.owner.area.distanceM)
			.filter((metres: number | null) => metres !== null);
		expect([...distances].sort((a: number, b: number) => a - b)).toEqual(
			distances,
		);
		expect(oz[0].nearestM).toBe(distances[0]);
		// Names are on the tile: who you ask depends on who you know.
		expect(oz[0].copies[0].owner.displayName).toBeTruthy();
	});

	it("marks the viewer's own copies so the tile can say so", async () => {
		// Own copies are out of browsing by default; asking for them back is
		// where the tile needs the flag.
		const listings = (await as(DANA).get("/v1/browse?showMine=1")).body.results;
		const oz = listings.find((one: any) => one.work.id === WORK);
		expect(oz.copies.some((copy: any) => copy.mine)).toBe(true);
	});

	it("keeps a book listed when every copy is out, and says none are free", async () => {
		const { activeLoan } = await import("../test/api.ts");
		await activeLoan(SAM, DANA, COPY_A);
		await activeLoan(NOA, DANA, COPY_B);
		const oz = (await as(SAM).get("/v1/browse")).body.results.find(
			(one: any) => one.work.id === WORK,
		);
		expect(oz).toBeDefined();
		expect(oz.available).toBe(0);
	});
});

describe("a listing wider than one statement", () => {
	it("still carries every book's tags", async () => {
		// D1 takes a hundred bound values; the storefront groups four hundred
		// copies. Before batching, a catalogue this size answered 500.
		const ids: string[] = [];
		for (let i = 0; i < 140; i += 1) {
			const id = `01J0WIDE${String(i).padStart(18, "0")}`;
			ids.push(id);
			await env.DB.prepare(
				`INSERT INTO works (id, title, authors, search_key, created_at)
				 VALUES (?, ?, '["A"]', ?, unixepoch())`,
			)
				.bind(id, `Wide ${i}`, `wide ${i}`)
				.run();
			await env.DB.prepare(
				`INSERT INTO work_tags (work_id, tag, added_by, created_at)
				 VALUES (?, 'audience:children', ?, unixepoch())`,
			)
				.bind(id, DANA)
				.run();
		}

		const { tagsForWorks } = await import("./tags.ts");
		const found = await tagsForWorks(env, ids);
		expect(found.size).toBe(140);
		expect(found.get(ids[139]!)).toEqual(["audience:children"]);
	});
});

describe("a moderator keeping the vocabulary", () => {
	it("adds a tag without anybody suggesting it", async () => {
		const made = await as(DANA).post("/v1/admin/tags", {
			namespace: "genre",
			value: "poetry-for-small-hands",
			labels: { en: "Poems for small hands", he: "שירים לידיים קטנות" },
		});
		expect(made.status).toBe(201);
		expect(made.body.tag).toBe("genre:poetry-for-small-hands");

		const vocab = await as(SAM).get("/v1/tags");
		expect(vocab.body.tags.map((tag: any) => tag.slug)).toContain(
			"genre:poetry-for-small-hands",
		);
	});

	it("adds a tag under a new label group", async () => {
		const made = await as(DANA).post("/v1/admin/tags", {
			namespace: "season",
			namespaceLabels: { en: "Season", he: "עונה" },
			value: "winter",
			labels: { en: "Winter", he: "חורף" },
		});
		expect(made.status).toBe(201);
		const vocab = await as(SAM).get("/v1/tags");
		expect(vocab.body.namespaces.map((one: any) => one.id)).toContain("season");
	});

	it("refuses a new group without its names", async () => {
		const made = await as(DANA).post("/v1/admin/tags", {
			namespace: "mood",
			value: "quiet",
			labels: { en: "Quiet", he: "שקט" },
		});
		expect(made.status).toBe(422);
	});

	it("says so when the tag is already there", async () => {
		const body = {
			namespace: "genre",
			value: "twice-told",
			labels: { en: "Twice told", he: "פעמיים" },
		};
		expect((await as(DANA).post("/v1/admin/tags", body)).status).toBe(201);
		expect((await as(DANA).post("/v1/admin/tags", body)).status).toBe(409);
	});

	it("renames a tag and its group", async () => {
		await as(DANA).post("/v1/admin/tags", {
			namespace: "genre",
			value: "old-name",
			labels: { en: "Old name", he: "שם ישן" },
		});
		const renamed = await as(DANA).patch("/v1/admin/tags/genre:old-name", {
			value: "new-name",
			labels: { en: "New name", he: "שם חדש" },
		});
		expect(renamed.status).toBe(200);
		expect(renamed.body.tag).toBe("genre:new-name");

		const group = await as(DANA).patch("/v1/admin/tag-namespaces/genre", {
			labels: { en: "Kind of book", he: "סוג ספר" },
		});
		expect(group.status).toBe(204);
		const vocab = await as(SAM).get("/v1/tags");
		const genre = vocab.body.namespaces.find((one: any) => one.id === "genre");
		expect(genre.labels.en).toBe("Kind of book");
		await as(DANA).patch("/v1/admin/tag-namespaces/genre", {
			labels: { en: "Genre", he: "ז׳אנר" },
		});
	});

	it("removes a tag from the vocabulary and from every book", async () => {
		await as(DANA).post("/v1/admin/tags", {
			namespace: "genre",
			value: "short-lived",
			labels: { en: "Short lived", he: "קצר ימים" },
		});
		await as(DANA).put(`/v1/works/${WORK}/tags`, {
			tags: ["genre:short-lived"],
		});
		const gone = await as(DANA).del("/v1/admin/tags/genre:short-lived");
		expect(gone.status).toBe(204);

		const vocab = await as(SAM).get("/v1/tags");
		expect(vocab.body.tags.map((tag: any) => tag.slug)).not.toContain(
			"genre:short-lived",
		);
		const onBook = await as(SAM).get(`/v1/works/${WORK}/tags`);
		expect(onBook.body.tags).not.toContain("genre:short-lived");
	});

	it("keeps the tags the library uses itself", async () => {
		const kept = await as(DANA).del("/v1/admin/tags/language:he");
		expect(kept.status).toBe(409);
	});

	it("is a moderator's to do", async () => {
		const body = {
			namespace: "genre",
			value: "not-yours",
			labels: { en: "Not yours", he: "לא שלך" },
		};
		expect((await as(SAM).post("/v1/admin/tags", body)).status).toBe(403);
		expect((await as(SAM).del("/v1/admin/tags/genre:not-yours")).status).toBe(
			403,
		);
	});
});

describe("the moderators' tagging queue", () => {
	it("walks this community's untagged books and drops one once tagged", async () => {
		const title = `Aaa untagged ${Date.now()}`;
		const listed = await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const first = await as(DANA).get("/v1/admin/tagging?only=untagged&at=0");
		expect(first.status).toBe(200);
		expect(first.body.work).toMatchObject({ id: listed.body.workId, title });
		const before = first.body.total as number;

		const tagged = await as(DANA).put(`/v1/works/${listed.body.workId}/tags`, {
			tags: ["genre:cooking"],
		});
		expect(tagged.status).toBe(204);
		expect(
			(await as(DANA).get(`/v1/works/${listed.body.workId}/tags`)).body.tags,
		).toEqual(["genre:cooking"]);
		const after = await as(DANA).get("/v1/admin/tagging?only=untagged&at=0");
		expect(after.body.total).toBe(before - 1);
		expect(after.body.work?.id).not.toBe(listed.body.workId);

		const all = await as(DANA).get("/v1/admin/tagging?only=all&at=0");
		expect(all.body.total).toBeGreaterThan(after.body.total);
		expect((await as(SAM).get("/v1/admin/tagging")).status).toBe(403);
	});

	it("walks the books with nothing in one group", async () => {
		const title = `Aaa no audience ${Date.now()}`;
		const listed = await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const id = listed.body.workId;
		await as(DANA).put(`/v1/works/${id}/tags`, { tags: ["genre:cooking"] });
		// Tagged, so not in "needs tags", but still without an audience.
		const missing = await as(DANA).get(
			"/v1/admin/tagging?only=missing:audience&at=0",
		);
		expect(missing.status).toBe(200);
		expect(missing.body.work).toMatchObject({ id, title });
		const before = missing.body.total as number;
		expect(
			(await as(DANA).get("/v1/admin/tagging?only=missing:genre&at=0")).body
				.work?.id,
		).not.toBe(id);

		await as(DANA).put(`/v1/works/${id}/tags`, {
			tags: ["genre:cooking", "audience:adult"],
		});
		const after = await as(DANA).get(
			"/v1/admin/tagging?only=missing:audience&at=0",
		);
		expect(after.body.total).toBe(before - 1);
		expect(after.body.work?.id).not.toBe(id);
		// Not a group's name: the "needs tags" queue, as with any unknown queue.
		expect(
			(await as(DANA).get("/v1/admin/tagging?only=missing:%25")).body.total,
		).toBe((await as(DANA).get("/v1/admin/tagging?only=untagged")).body.total);
	});
});

describe("a member's own tagging queue", () => {
	it("walks only the books on their shelf", async () => {
		const title = `Aaa mine ${Date.now()}`;
		const mine = await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const step = await as(SAM).get("/v1/me/tagging?only=untagged&at=0");
		expect(step.status).toBe(200);
		expect(step.body.work).toMatchObject({ id: mine.body.workId });
		// Dana's seeded book is not Sam's to walk through.
		const all = await as(SAM).get("/v1/me/tagging?only=all&at=0");
		for (let at = 0; at < all.body.total; at += 1) {
			const one = await as(SAM).get(`/v1/me/tagging?only=all&at=${at}`);
			expect(one.body.work.id).not.toBe(WORK);
		}
	});

	it("walks their books with nothing in one group", async () => {
		const title = `Aaa mine no genre ${Date.now()}`;
		const mine = await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const step = await as(SAM).get("/v1/me/tagging?only=missing:genre&at=0");
		expect(step.status).toBe(200);
		expect(step.body.work).toMatchObject({ id: mine.body.workId });
		for (let at = 0; at < step.body.total; at += 1) {
			const one = await as(SAM).get(
				`/v1/me/tagging?only=missing:genre&at=${at}`,
			);
			expect(one.body.work.id).not.toBe(WORK);
		}
	});
});

describe("what needs a moderator", () => {
	it("is counted apart from a member's loans", async () => {
		const before = (await as(DANA).get("/v1/me")).body;
		await as(SAM).post("/v1/tags/proposals", {
			namespace: "genre",
			label: "Waiting to be looked at",
		});
		const after = (await as(DANA).get("/v1/me")).body;
		expect(after.moderation).toBe(before.moderation + 1);
		expect(after.attention).toBe(before.attention);
		// A member has nothing to moderate.
		expect((await as(SAM).get("/v1/me")).body.moderation).toBe(0);
	});
});

describe("tag limits", () => {
	it("refuses a tag group longer than a tag can carry, and caps a filter", async () => {
		const { as, DANA, SAM } = await import("../test/api.ts");
		const long = await as(DANA).post("/v1/admin/tags", {
			namespace: "a".repeat(31),
			namespaceLabels: { en: "Long" },
			value: "one",
			labels: { en: "One" },
		});
		expect(long.status).toBe(422);
		const many = Array.from({ length: 95 }, (_, n) => `genre:g${n}`).join(",");
		expect((await as(SAM).get(`/v1/browse?tags=${many}`)).status).toBe(200);
	});
});
