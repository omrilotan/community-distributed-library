import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { as, DANA, NOA, SAM } from "../test/api.ts";

/** Dana lists a book; Sam, the reader, marks it read. */
async function aBookSamCanSee(label: string) {
	const title = `${label} ${Date.now()}`;
	const added = await as(DANA).post("/v1/copies", {
		manual: { title, authors: ["A. Stub"] },
	});
	const page = await as(DANA).get(`/v1/copies/${added.body.id}`);
	return { title, workId: page.body.work.id as string };
}

const workIds = (response: { body: { results: { work: { id: string } }[] } }) =>
	response.body.results.map((listing) => listing.work.id);

describe("books you have read", () => {
	it("leave browse and search, and come back when asked for", async () => {
		const { title, workId } = await aBookSamCanSee("Read it");
		const search = `/v1/search?q=${encodeURIComponent(title)}`;
		expect(workIds(await as(SAM).get("/v1/browse?limit=240"))).toContain(
			workId,
		);

		expect((await as(SAM).put(`/v1/me/read/${workId}`, {})).status).toBe(204);
		expect(workIds(await as(SAM).get("/v1/browse?limit=240"))).not.toContain(
			workId,
		);
		expect(workIds(await as(SAM).get(search))).toEqual([]);
		expect(
			workIds(await as(SAM).get("/v1/browse?limit=240&showRead=1")),
		).toContain(workId);
		expect(workIds(await as(SAM).get(`${search}&showRead=1`))).toEqual([
			workId,
		]);

		// Only for the one who read it.
		expect(workIds(await as(DANA).get(`${search}&showMine=1`))).toEqual([
			workId,
		]);

		// Still on the lender's own shelf, when that is what was asked for.
		expect(
			workIds(await as(SAM).get(`/v1/browse?limit=240&owner=${DANA}`)),
		).toContain(workId);
	});

	it("are marked on the book's page, and can be unmarked", async () => {
		const { workId } = await aBookSamCanSee("Unread it");
		expect((await as(SAM).get(`/v1/works/${workId}`)).body.read).toBe(false);
		await as(SAM).put(`/v1/me/read/${workId}`, {});
		// Twice is the same as once.
		expect((await as(SAM).put(`/v1/me/read/${workId}`, {})).status).toBe(204);
		const page = await as(SAM).get(`/v1/works/${workId}`);
		expect(page.body.read).toBe(true);
		// Still a book with copies on its own page.
		expect(page.body.copies).toHaveLength(1);
		expect((await as(DANA).get(`/v1/works/${workId}`)).body.read).toBe(false);

		expect((await as(SAM).del(`/v1/me/read/${workId}`)).status).toBe(204);
		expect((await as(SAM).get(`/v1/works/${workId}`)).body.read).toBe(false);
	});

	it("must be books that exist", async () => {
		expect(
			(await as(SAM).put("/v1/me/read/01J0NOSUCHWORK000000000000", {})).status,
		).toBe(404);
	});

	it("go with the rest of a member's data", async () => {
		const { workId } = await aBookSamCanSee("Exported");
		await as(SAM).put(`/v1/me/read/${workId}`, {});
		// The admin's export for a member (data rights) lists them.
		const role = (to: string) =>
			env.DB.prepare(
				"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = '01J0COMMUNITY0000000FINCH'",
			)
				.bind(to, DANA)
				.run();
		await role("admin");
		const exported = await as(DANA)
			.post(`/v1/admin/members/${SAM}/export`)
			.finally(() => role("moderator"));
		expect(exported.body.booksRead).toEqual([
			expect.objectContaining({ work_id: workId }),
		]);
	});
});

const sentTo = async (who: string, kind: string) =>
	(
		await (
			env.NOTIFY as unknown as {
				sentMessages(): Promise<{ kind: string; to: string; url: string }[]>;
			}
		).sentMessages()
	).filter((message) => message.kind === kind && message.to === who);

describe("the wishlist", () => {
	it("keeps books to read later, with what is here and what is not", async () => {
		const { workId } = await aBookSamCanSee("Wished");
		expect((await as(SAM).get(`/v1/works/${workId}`)).body.wished).toBe(false);
		expect((await as(SAM).put(`/v1/me/wishlist/${workId}`, {})).status).toBe(
			204,
		);
		expect((await as(SAM).get(`/v1/works/${workId}`)).body.wished).toBe(true);

		const list = await as(SAM).get("/v1/me/wishlist");
		expect(workIds(list)).toEqual([workId]);
		expect(list.body.withoutCopies).toEqual([]);
		// Nobody else's list.
		expect(workIds(await as(DANA).get("/v1/me/wishlist"))).toEqual([]);

		expect((await as(SAM).del(`/v1/me/wishlist/${workId}`)).status).toBe(204);
		expect(workIds(await as(SAM).get("/v1/me/wishlist"))).toEqual([]);
	});

	it("lets go of a book once it is read", async () => {
		const { workId } = await aBookSamCanSee("Wished then read");
		await as(SAM).put(`/v1/me/wishlist/${workId}`, {});
		await as(SAM).put(`/v1/me/read/${workId}`, {});
		expect((await as(SAM).get(`/v1/works/${workId}`)).body.wished).toBe(false);
	});

	it("tells the reader when a copy is free, once a week at most", async () => {
		const { title, workId } = await aBookSamCanSee("Wished for");
		await as(SAM).put(`/v1/me/wishlist/${workId}`, {});
		// Noa wants it too, until she finds her own copy.
		await as(NOA).put(`/v1/me/wishlist/${workId}`, {});
		const before = (await sentTo("sam@example.com", "wishlist_available"))
			.length;

		// Noa puts another copy of the same book on her shelf.
		const second = await as(NOA).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		expect(
			(await as(NOA).get(`/v1/copies/${second.body.id}`)).body.work.id,
		).toBe(workId);
		const told = await sentTo("sam@example.com", "wishlist_available");
		expect(told).toHaveLength(before + 1);
		expect(told.at(-1)?.url).toContain(`/works/${workId}`);

		// Free again the same week, after a pause: quiet.
		await as(NOA).patch(`/v1/copies/${second.body.id}`, { lending: "paused" });
		await as(NOA).patch(`/v1/copies/${second.body.id}`, {
			lending: "lendable",
		});
		expect(await sentTo("sam@example.com", "wishlist_available")).toHaveLength(
			before + 1,
		);
		// An owner is not told about their own copy.
		expect(await sentTo("noa@example.com", "wishlist_available")).toHaveLength(
			0,
		);
	});
});
