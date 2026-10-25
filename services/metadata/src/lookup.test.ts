import { describe, expect, it } from "vitest";
import type { MetadataLookup } from "@cdl/contracts";
import { lookup, type LookupDb } from "./lookup.ts";

const ISBN = "9780000000002";
const book: MetadataLookup = {
	isbn13: ISBN,
	title: "Stub Book",
	authors: ["A. Stub", ""],
	publisher: null,
	publishedYear: 2001,
	language: "en",
	pageCount: 100,
	coverUrl: null,
	source: "googlebooks",
};

/** Two tables, as rows in memory: enough of D1 for the lookup. */
function memoryDb() {
	const cache = new Map<string, { payload: string; fetched_at: number }>();
	const misses = new Map<string, { fetched_at: number }>();
	const db: LookupDb = {
		prepare(query: string) {
			return {
				bind(...values: unknown[]) {
					return {
						async first<T>() {
							const table = query.includes("lookup_cache") ? cache : misses;
							return (table.get(String(values[0])) ?? null) as T | null;
						},
						async run() {
							if (query.includes("lookup_cache"))
								cache.set(String(values[0]), {
									payload: String(values[2]),
									fetched_at: Number(values[3]),
								});
							else
								misses.set(String(values[0]), {
									fetched_at: Number(values[1]),
								});
							return {};
						},
					};
				},
			};
		},
	};
	return { db, cache, misses };
}

const knows = async () => book;
const doesNotKnow = async () => null;
const isDown = async () => "unavailable" as const;
const throws = async (): Promise<null> => {
	throw new Error("timed out");
};

describe("looking an ISBN up", () => {
	it("remembers a book, without its empty author names", async () => {
		const { db, cache } = memoryDb();
		const found = await lookup(db, {}, ISBN, [doesNotKnow, knows]);
		expect(found?.authors).toEqual(["A. Stub"]);
		expect(cache.has(ISBN)).toBe(true);
		// Asked again, the providers are not.
		expect(await lookup(db, {}, ISBN, [isDown])).toEqual(found);
	});

	it("remembers a miss only when every provider said it does not know", async () => {
		const { db, misses } = memoryDb();
		expect(await lookup(db, {}, ISBN, [doesNotKnow, isDown])).toBeNull();
		expect(misses.has(ISBN)).toBe(false);
		expect(await lookup(db, {}, ISBN, [doesNotKnow, throws])).toBeNull();
		expect(misses.has(ISBN)).toBe(false);
		// Both answered: a week before asking again.
		expect(await lookup(db, {}, ISBN, [doesNotKnow, doesNotKnow])).toBeNull();
		expect(misses.has(ISBN)).toBe(true);
		expect(await lookup(db, {}, ISBN, [knows])).toBeNull();
	});

	it("passes over a record it cannot read, from a provider or the cache", async () => {
		const { db, cache } = memoryDb();
		const odd = async () =>
			({ ...book, title: 42, authors: "A. Stub" }) as unknown as MetadataLookup;
		cache.set(ISBN, { payload: "{not json", fetched_at: 0 });
		expect((await lookup(db, {}, ISBN, [odd, knows]))?.title).toBe("Stub Book");
		expect(JSON.parse(cache.get(ISBN)!.payload).title).toBe("Stub Book");
	});

	it("fetches an old record again, and keeps it while providers are away", async () => {
		const { db, cache } = memoryDb();
		const long = Math.floor(Date.now() / 1000) - 100 * 24 * 3600;
		await lookup(db, {}, ISBN, [knows], long);
		const fresh = { ...book, title: "Stub Book, corrected" };
		expect((await lookup(db, {}, ISBN, [isDown]))?.title).toBe("Stub Book");
		expect((await lookup(db, {}, ISBN, [async () => fresh]))?.title).toBe(
			"Stub Book, corrected",
		);
		expect(JSON.parse(cache.get(ISBN)!.payload).title).toBe(
			"Stub Book, corrected",
		);
	});
});
