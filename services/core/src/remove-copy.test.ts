import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { as, NOA, SAM } from "../test/api.ts";

/** Lists a hand-typed book whose cover comes from a provider's address. */
async function list(
	who: string,
	title: string,
	cover = "https://covers.ok/b/id/7-M.jpg",
) {
	const listed = await as(who).post("/v1/copies", {
		manual: { title, authors: ["A. Writer"], coverUrl: cover },
	});
	expect(listed.status).toBe(201);
	const { body } = await as(who).get(`/v1/copies/${listed.body.id}`);
	return {
		copyId: listed.body.id as string,
		editionId: body.edition.id as string,
		coverUrl: body.edition.coverUrl as string,
	};
}

const editionExists = async (id: string) =>
	Boolean(
		await env.DB.prepare("SELECT 1 FROM editions WHERE id = ?")
			.bind(id)
			.first(),
	);
const imageExists = async (url: string) =>
	Boolean(await env.COVERS.head(new URL(url).pathname.slice(1)));

describe("removing a copy that never went anywhere", () => {
	it("takes its hand-typed edition and picture with it", async () => {
		const mine = await list(
			SAM,
			`Only Mine ${Date.now()}`,
			"https://covers.ok/b/id/1-M.jpg",
		);
		expect(await imageExists(mine.coverUrl)).toBe(true);
		expect((await as(SAM).del(`/v1/copies/${mine.copyId}`)).status).toBe(204);
		expect(await editionExists(mine.editionId)).toBe(false);
		expect(await imageExists(mine.coverUrl)).toBe(false);
		// The cache forgets it too, so the next listing fetches it again.
		expect(
			await env.DB.prepare("SELECT 1 FROM cover_cache WHERE cover_url = ?")
				.bind(mine.coverUrl)
				.first(),
		).toBeNull();
	});

	it("keeps a picture another edition shows", async () => {
		// The provider gave both books the same picture: one image, two editions.
		const sams = await list(
			SAM,
			`Sam's Copy ${Date.now()}`,
			"https://covers.ok/b/id/2-M.jpg",
		);
		const noas = await list(
			NOA,
			`Noa's Copy ${Date.now()}`,
			"https://covers.ok/b/id/2-M.jpg",
		);
		expect(noas.coverUrl).toBe(sams.coverUrl);
		await as(SAM).del(`/v1/copies/${sams.copyId}`);
		expect(await editionExists(sams.editionId)).toBe(false);
		expect(await imageExists(sams.coverUrl)).toBe(true);
		expect(await editionExists(noas.editionId)).toBe(true);
	});

	it("leaves a book's ISBN edition in the catalogue", async () => {
		const listed = await as(SAM).post("/v1/copies", {
			isbn13: "9780000000019",
		});
		const { body } = await as(SAM).get(`/v1/copies/${listed.body.id}`);
		await as(SAM).del(`/v1/copies/${listed.body.id}`);
		expect(await editionExists(body.edition.id)).toBe(true);
	});
});
