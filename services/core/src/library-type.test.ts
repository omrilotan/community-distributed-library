import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { as, DANA, SAM } from "../test/api.ts";
import { forget, vocabularyKey } from "./cache.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";

const becomes = async (type: "books" | "things") => {
	await env.DB.prepare("UPDATE communities SET type = ? WHERE id = ?")
		.bind(type, FINCH)
		.run();
	// The vocabulary is cached for a minute; a type changes only when a library opens.
	await forget(env, vocabularyKey(FINCH));
};

afterEach(async () => {
	await becomes("books");
});

describe("built-in tags by library type", () => {
	const namespaces = async () =>
		((await as(SAM).get("/v1/tags")).body.namespaces as { id: string }[]).map(
			(namespace) => namespace.id,
		);
	const slugs = async () =>
		((await as(SAM).get("/v1/tags")).body.tags as { slug: string }[]).map(
			(tag) => tag.slug,
		);

	it("a books library has language, audience and genre, and no categories", async () => {
		expect(await namespaces()).toEqual(
			expect.arrayContaining(["language", "audience", "genre"]),
		);
		expect(await namespaces()).not.toContain("category");
		expect(await slugs()).not.toContain("category:tools");
	});

	it("a things library has categories, and none of the book tags", async () => {
		await becomes("things");
		const ids = await namespaces();
		expect(ids).toContain("category");
		expect(ids).not.toContain("language");
		const all = await slugs();
		expect(all).toEqual(
			expect.arrayContaining(["category:tools", "category:camping"]),
		);
		expect(all.some((slug) => slug.startsWith("genre:"))).toBe(false);
		// No "everything else": an item may simply have no category.
		expect(all).not.toContain("category:other");
	});
});

describe("adding a thing", () => {
	const chairs = {
		thing: {
			name: "Folding chairs",
			quantity: 12,
			details: { brand: "Lifetime", included: "carry bag" },
			category: "party",
		},
	};

	it("is refused by a books library, and a book by a things library", async () => {
		expect((await as(SAM).post("/v1/copies", chairs)).status).toBe(422);
		await becomes("things");
		const book = await as(SAM).post("/v1/copies", {
			manual: { title: "A Book", authors: ["Someone"] },
		});
		expect(book.status).toBe(422);
	});

	it("makes its own entry, with details, quantity and category", async () => {
		await becomes("things");
		const first = await as(SAM).post("/v1/copies", chairs);
		expect(first.status).toBe(201);
		const second = await as(SAM).post("/v1/copies", chairs);
		expect(second.status).toBe(201);
		// Two neighbours' folding chairs are two entries, not one.
		expect(second.body.workId).not.toBe(first.body.workId);

		const copy = await env.DB.prepare(
			"SELECT quantity, details, search_key, relay_allowed FROM copies WHERE id = ?",
		)
			.bind(first.body.id)
			.first<{
				quantity: number;
				details: string;
				search_key: string;
				relay_allowed: number;
			}>();
		expect(copy?.quantity).toBe(12);
		expect(JSON.parse(copy!.details)).toEqual({
			brand: "Lifetime",
			included: "carry bag",
		});
		expect(copy?.search_key).toContain("lifetime");
		// A set comes back to its owner; it is never passed straight on.
		expect(copy?.relay_allowed).toBe(0);
		const tags = await env.DB.prepare(
			"SELECT tag FROM work_tags WHERE work_id = ?",
		)
			.bind(first.body.workId)
			.all<{ tag: string }>();
		expect(tags.results.map((row) => row.tag)).toEqual(["category:party"]);
	});

	it("takes only a category the library has", async () => {
		await becomes("things");
		const response = await as(SAM).post("/v1/copies", {
			thing: { name: "Drill", category: "spaceships" },
		});
		expect(response.status).toBe(422);
		const bad = await as(SAM).post("/v1/copies", {
			thing: { name: "Drill", details: { colour: "red" } },
		});
		expect(bad.status).toBe(422);
	});
});

describe("a thing on the shelves", () => {
	it("shows its details and quantity, is found by brand, and can be edited", async () => {
		await becomes("things");
		const added = await as(SAM).post("/v1/copies", {
			thing: {
				name: "Cordless drill",
				details: { brand: "Makita", needs: "Drill bits" },
			},
		});
		expect(added.status).toBe(201);
		const id = added.body.id as string;

		type Found = { copies: { id: string }[] }[];
		const copyIn = (results: Found) =>
			results.flatMap((entry) => entry.copies).find((copy) => copy.id === id);
		const found = await as(DANA).get("/v1/search?q=makita");
		const listing = copyIn(found.body.results);
		expect(listing).toMatchObject({
			quantity: 1,
			details: { brand: "Makita", needs: "Drill bits" },
		});

		expect(
			(
				await as(SAM).patch(`/v1/copies/${id}`, {
					quantity: 2,
					details: { brand: "Bosch" },
				})
			).status,
		).toBe(204);
		const mine = (await as(SAM).get(`/v1/copies/${id}`)).body;
		expect(mine).toMatchObject({ quantity: 2, details: { brand: "Bosch" } });
		expect(
			copyIn((await as(DANA).get("/v1/search?q=makita")).body.results),
		).toBe(undefined);
	});

	it("a book takes neither details nor a quantity", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: "Plain Book", authors: ["Author"] },
		});
		expect(
			(await as(SAM).patch(`/v1/copies/${added.body.id}`, { quantity: 3 }))
				.status,
		).toBe(422);
		const listing = (await as(SAM).get(`/v1/copies/${added.body.id}`)).body;
		expect(listing).toMatchObject({ quantity: 1, details: null });
	});
});

describe("a thing's product page", () => {
	it("takes a web address, and nothing else", async () => {
		await becomes("things");
		const added = await as(SAM).post("/v1/copies", {
			thing: {
				name: "Pressure washer",
				details: { link: "https://www.karcher.com/uk/k-4.html" },
			},
		});
		expect(added.status).toBe(201);
		expect(
			(await as(SAM).get(`/v1/copies/${added.body.id}`)).body.details,
		).toEqual({
			link: "https://www.karcher.com/uk/k-4.html",
		});
		for (const link of [
			"javascript:alert(1)",
			"ftp://example.com/x",
			"not a link",
		])
			expect(
				(
					await as(SAM).post("/v1/copies", {
						thing: { name: "Drill", details: { link } },
					})
				).status,
			).toBe(422);
	});
});

describe("a thing's photos", () => {
	const photo = (n: number) => `http://covers.test/01J0PHOTO${n}.jpg`;

	it("keeps up to four, the first being its picture everywhere", async () => {
		await becomes("things");
		const added = await as(SAM).post("/v1/copies", {
			thing: { name: "Gazebo", photoUrls: [photo(1), photo(2), photo(3)] },
		});
		expect(added.status).toBe(201);
		const id = added.body.id as string;
		const mine = (await as(SAM).get(`/v1/copies/${id}`)).body;
		expect(mine.photos).toEqual([photo(1), photo(2), photo(3)]);
		expect(mine.edition.coverUrl).toBe(photo(1));

		// Reordered and trimmed: the new first is the new picture.
		expect(
			(
				await as(SAM).patch(`/v1/copies/${id}`, {
					photos: [photo(3), photo(1)],
				})
			).status,
		).toBe(204);
		const after = (await as(SAM).get(`/v1/copies/${id}`)).body;
		expect(after.photos).toEqual([photo(3), photo(1)]);
		expect(after.edition.coverUrl).toBe(photo(3));

		// A single new picture takes the first place and keeps the rest.
		expect(
			(await as(SAM).patch(`/v1/copies/${id}`, { coverUrl: photo(4) })).status,
		).toBe(204);
		expect((await as(SAM).get(`/v1/copies/${id}`)).body.photos).toEqual([
			photo(4),
			photo(1),
		]);

		// Five is one too many.
		expect(
			(
				await as(SAM).patch(`/v1/copies/${id}`, {
					photos: [1, 2, 3, 4, 5].map(photo),
				})
			).status,
		).toBe(422);
	});

	it("follow a picture a moderator sets, or takes away", async () => {
		await becomes("things");
		// Listed without photos; a moderator gives it a picture.
		const added = await as(SAM).post("/v1/copies", {
			thing: { name: `Ladder ${Date.now()}` },
		});
		const id = added.body.id as string;
		const workId = (await as(SAM).get(`/v1/copies/${id}`)).body.edition.workId;
		expect(
			(
				await as(DANA).patch(`/v1/admin/works/${workId}`, {
					coverUrl: photo(5),
				})
			).status,
		).toBe(200);
		expect((await as(SAM).get(`/v1/copies/${id}`)).body.photos).toEqual([
			photo(5),
		]);
		// Its owner then fixes the note, sending the photos as they now are.
		await as(SAM).patch(`/v1/copies/${id}`, {
			note: "By the shed",
			photos: [photo(5)],
		});
		expect((await as(SAM).get(`/v1/copies/${id}`)).body.edition.coverUrl).toBe(
			photo(5),
		);
		// Taken away by the moderator: gone from the photos too.
		await as(DANA).patch(`/v1/admin/works/${workId}`, { coverUrl: null });
		expect((await as(SAM).get(`/v1/copies/${id}`)).body.photos).toEqual([]);
	});

	it("a book has one cover and no photos", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: "Photo Book", authors: ["Author"] },
		});
		expect(
			(
				await as(SAM).patch(`/v1/copies/${added.body.id}`, {
					photos: [photo(1)],
				})
			).status,
		).toBe(422);
	});
});

describe("labels in the library's languages", () => {
	it("take one language, and the other is filled from it", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'moderator' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const made = await as(DANA).post("/v1/admin/tags", {
			namespace: "genre",
			value: "one-language-test",
			labels: { en: "One language" },
		});
		expect(made.status).toBe(201);
		const row = await env.DB.prepare(
			"SELECT label_en, label_he FROM tags WHERE slug = 'genre:one-language-test'",
		).first();
		expect(row).toEqual({ label_en: "One language", label_he: "One language" });
		expect(
			(
				await as(DANA).post("/v1/admin/tags", {
					namespace: "genre",
					value: "no-language-test",
					labels: {},
				})
			).status,
		).toBe(422);
	});
});
