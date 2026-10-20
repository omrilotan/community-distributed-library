import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, as, DANA, NOA, SAM, WORK } from "../test/api.ts";
import { similarity } from "./duplicates.ts";

const book = (title: string, authors: string[] = ["ינץ לוי"]) => ({
	title,
	authors,
});

describe("telling one book from another", () => {
	it("treats a missing subtitle as the same book", () => {
		expect(
			similarity(
				book("הרפתקאות דוד אריה 1 בערבות רומניה"),
				book("הרפתקאות דוד אריה 1"),
			),
		).toBeGreaterThan(0.8);
	});

	it("never matches two books in a series", () => {
		// Nine of these sit on the shelves and differ by one character.
		expect(
			similarity(
				book("ילד נינג'ה 1: מחנון - לנינג'ה!", ["אן דו"]),
				book("ילד נינג'ה 9: דגי הנינג'ה!", ["אן דו"]),
			),
		).toBe(0);
		expect(similarity(book("הסיפור המושלם 1"), book("הסיפור המושלם 2"))).toBe(
			0,
		);
		// A number on one side only is still a difference.
		expect(similarity(book("כראמל"), book("כראמל 1"))).toBe(0);
	});

	it("ignores punctuation, niqqud and final forms", () => {
		expect(
			similarity(
				book("אבא עושה בושות", ["מאיר שלו"]),
				book("אבא עושה בושות", ["מאיר שלו"]),
			),
		).toBe(1);
	});

	it("will not match two authors' unrelated books", () => {
		expect(
			similarity(
				book("הבית של יעל", ["מרים רות"]),
				book("הבית של יעל", ["גליה עוז"]),
			),
		).toBe(0);
	});

	it("matches a shared author writing under a longer name", () => {
		expect(
			similarity(book("סבון", ["יורם קניוק"]), book("סבון", ["קניוק"])),
		).toBeGreaterThan(0.9);
	});
});

describe("merging two records of one book", () => {
	async function twin() {
		// Noa lists the same book Dana has, with the subtitle typed out.
		const listed = await as(NOA).post("/v1/copies", {
			manual: { title: "Oz the Great and Powerful", authors: ["Baum"] },
		});
		return listed.body.workId as string;
	}

	it("offers the near match to whoever just listed it", async () => {
		const twinId = await twin();
		const offered = await as(NOA).get(`/v1/works/${twinId}/duplicates`);
		expect(offered.body.candidates).toHaveLength(1);
		expect(offered.body.candidates[0]).toMatchObject({
			id: WORK,
			owners: ["Dana"],
		});
	});

	it("brings the copies, tags and waiting members across", async () => {
		await as(DANA).put(`/v1/works/${WORK}/tags`, { tags: ["genre:fiction"] });
		const twinId = await twin();
		await as(NOA).put(`/v1/works/${twinId}/tags`, {
			tags: ["audience:children"],
		});
		await as(SAM).post("/v1/waitlist", { workId: twinId });

		const merged = await as(NOA).post(`/v1/works/${twinId}/merge`, {
			into: WORK,
		});
		expect(merged.status).toBe(200);

		const page = await as(SAM).get(`/v1/works/${WORK}`);
		expect(page.body.copies.length).toBeGreaterThanOrEqual(3);
		expect(page.body.work.tags).toEqual(["audience:children", "genre:fiction"]);
		expect((await as(SAM).get("/v1/me/waitlist")).body.entries[0].workId).toBe(
			WORK,
		);
		expect((await as(NOA).get(`/v1/works/${twinId}`)).status).toBe(404);
	});

	it("is refused to somebody holding neither copy", async () => {
		const twinId = await twin();
		expect(
			(await as(SAM).post(`/v1/works/${twinId}/merge`, { into: WORK })).status,
		).toBe(403);
	});

	it("will not let a member fold somebody else's book into theirs", async () => {
		const theirs = await twin();
		const mine = await as(SAM).post("/v1/copies", {
			manual: { title: "Oz, the Great and Powerful", authors: ["Baum"] },
		});
		expect(
			(
				await as(SAM).post(`/v1/works/${theirs}/merge`, {
					into: mine.body.workId,
				})
			).status,
		).toBe(403);
		expect((await as(NOA).get(`/v1/works/${theirs}`)).status).toBe(200);
	});

	it("refuses an unlikely pair unless a moderator asks", async () => {
		const unrelated = await as(NOA).post("/v1/copies", {
			manual: { title: "Something else entirely", authors: ["Nobody"] },
		});
		const refused = await as(NOA).post(
			`/v1/works/${unrelated.body.workId}/merge`,
			{ into: WORK },
		);
		expect(refused.status).toBe(409);
		// Dana is a moderator, and a moderator who means it is allowed.
		expect(
			(
				await as(DANA).post(`/v1/works/${unrelated.body.workId}/merge`, {
					into: WORK,
				})
			).status,
		).toBe(200);
	});

	it("stops offering a pair somebody has said are different", async () => {
		const twinId = await twin();
		expect(
			(await as(NOA).post(`/v1/works/${twinId}/distinct`, { from: WORK }))
				.status,
		).toBe(204);
		expect(
			(await as(NOA).get(`/v1/works/${twinId}/duplicates`)).body.candidates,
		).toHaveLength(0);
		// And it leaves the moderator's queue too.
		expect(
			(await as(DANA).get("/v1/admin/duplicates")).body.pairs,
		).toHaveLength(0);
	});

	it("shows moderators every suspected pair, once", async () => {
		await twin();
		const queue = await as(DANA).get("/v1/admin/duplicates");
		expect(queue.body.pairs).toHaveLength(1);
		expect((await as(SAM).get("/v1/admin/duplicates")).status).toBe(403);
	});
});

describe("members bringing in neighbours", () => {
	it("gives a member one link for one person, for a fortnight", async () => {
		const made = await as(SAM).post("/v1/invites", { maxUses: 50, days: 30 });
		expect(made.status).toBe(201);
		// A member's invite is for the neighbour they mean to ask, not a broadcast.
		expect(made.body.maxUses).toBe(1);
		const days = (made.body.expiresAt - Math.floor(Date.now() / 1000)) / 86_400;
		expect(Math.round(days)).toBe(14);
		expect(made.body.url).toContain("/join?invite=");
	});

	it("lets a moderator make a batch that lasts longer", async () => {
		const made = await as(DANA).post("/v1/invites", { maxUses: 20, days: 30 });
		expect(made.body.maxUses).toBe(20);
		expect(
			Math.round(
				(made.body.expiresAt - Math.floor(Date.now() / 1000)) / 86_400,
			),
		).toBe(30);
	});

	it("stops at five open invites, and frees a slot when one is withdrawn", async () => {
		for (let index = 0; index < 5; index += 1) {
			expect((await as(SAM).post("/v1/invites", {})).status).toBe(201);
		}
		expect((await as(SAM).post("/v1/invites", {})).status).toBe(409);

		const mine = await as(SAM).get("/v1/me/invites");
		expect(mine.body.invites).toHaveLength(5);
		// The link is not in the listing: only its hash was ever kept.
		expect(mine.body.invites[0].url).toBeUndefined();

		expect(
			(await as(SAM).post(`/v1/me/invites/${mine.body.invites[0].id}/revoke`))
				.status,
		).toBe(204);
		expect((await as(SAM).post("/v1/invites", {})).status).toBe(201);
	});

	it("records who vouched, and shows the inviter that it worked", async () => {
		const { api } = await import("../test/api.ts");
		const invite = await as(SAM).post("/v1/invites", {});

		// The newcomer follows the link and signs in with their email.
		const email = "newcomer@example.com";
		const asked = await api(null, "POST", "/v1/auth/magic-link", {
			email,
			invite: invite.body.token,
		});
		expect(asked.status).toBe(200);
		const token = new URL(asked.body.debugUrl).searchParams.get("token");
		const session = await api(null, "POST", "/v1/auth/exchange", { token });
		expect(session.status).toBe(200);

		const joined = await env.DB.prepare(
			"SELECT id, invited_by, invited_via FROM members WHERE email = ?",
		)
			.bind(email)
			.first<{ id: string; invited_by: string; invited_via: string }>();
		expect(joined).toMatchObject({
			invited_by: SAM,
			invited_via: invite.body.id,
		});

		// Sam sees that the invite was taken up, and cannot withdraw it now.
		const mine = await as(SAM).get("/v1/me/invites");
		expect(mine.body.invites[0]).toMatchObject({ uses: 1 });
		expect(mine.body.invites[0].joined).toEqual([
			{ id: joined!.id, displayName: "newcomer" },
		]);
	});

	it("stops bringing anyone in while its maker is suspended", async () => {
		const { api } = await import("../test/api.ts");
		const invite = await as(SAM).post("/v1/invites", {});
		const suspend = (status: string) =>
			env.DB.prepare(
				"UPDATE memberships SET status = ? WHERE member_id = ? AND community_id = '01J0COMMUNITY0000000FINCH'",
			)
				.bind(status, SAM)
				.run();
		await suspend("suspended");
		try {
			const asked = await api(null, "POST", "/v1/auth/magic-link", {
				email: "stranger@example.com",
				invite: invite.body.token,
			});
			// Asked as for any address: no link that joins anyone.
			expect(asked.body.debugUrl ?? null).toBeNull();
			expect(
				await env.DB.prepare(
					"SELECT 1 FROM members WHERE email = 'stranger@example.com'",
				).first(),
			).toBeNull();
		} finally {
			await suspend("active");
		}
	});

	it("will not let a stranger make one", async () => {
		const { api } = await import("../test/api.ts");
		expect((await api(null, "POST", "/v1/invites", {})).status).toBe(401);
		expect((await api(null, "GET", "/v1/me/invites")).status).toBe(401);
	});
});

describe("moderators correcting a book", () => {
	it("fixes the title for everyone holding a copy", async () => {
		const fixed = await as(DANA).patch("/v1/admin/works/" + WORK, {
			title: "Oz, the Marvellous Land of",
			authors: ["L. Frank Baum"],
		});
		expect(fixed.status).toBe(200);
		const page = await as(SAM).get(`/v1/works/${WORK}`);
		expect(page.body.work.title).toBe("Oz, the Marvellous Land of");
		expect(page.body.work.authors).toEqual(["L. Frank Baum"]);
		// With one edition the tile title is the same thing to a reader.
		expect(page.body.editions[0].title).toBe("Oz, the Marvellous Land of");
		// And it is findable under the new name.
		expect(
			(await as(SAM).get("/v1/search?q=marvellous")).body.results.length,
		).toBeGreaterThan(0);
	});

	it("is not something a member can do to somebody else's book", async () => {
		expect(
			(await as(SAM).patch("/v1/admin/works/" + WORK, { title: "Mine now" }))
				.status,
		).toBe(403);
	});
});

describe("a book other members list too", () => {
	const list = async (who: string, title: string, authors = ["A. Writer"]) =>
		(await as(who).post("/v1/copies", { manual: { title, authors } })).body as {
			id: string;
			workId: string;
		};
	const titleOf = async (workId: string) =>
		(await as(DANA).get(`/v1/works/${workId}`)).body.work.title;
	/** Dana lists a book, and Noa's hand-typed copy of it joins the same work. */
	const shared = async () => {
		const title = `Shared Tale ${Date.now()}`;
		const dana = await list(DANA, title);
		const noa = await list(NOA, title);
		expect(noa.workId).toBe(dana.workId);
		return { title, workId: dana.workId, noaCopy: noa.id };
	};

	it("cannot be renamed by one of them", async () => {
		const { title, workId, noaCopy } = await shared();
		expect(
			(await as(NOA).get(`/v1/copies/${noaCopy}`)).body.editable.details,
		).toBe(false);
		expect(
			(
				await as(NOA).patch(`/v1/copies/${noaCopy}`, {
					title: "Vandalised",
					authors: ["Someone Else"],
				})
			).status,
		).toBe(409);
		expect(await titleOf(workId)).toBe(title);
	});

	it("cannot be merged away, or renamed by a merge, by one of them", async () => {
		const { title, workId } = await shared();
		const own = await list(NOA, `${title} Returns`);
		// The shared book is Dana's as much as Noa's.
		expect(
			(await as(NOA).post(`/v1/works/${workId}/merge`, { into: own.workId }))
				.status,
		).toBe(403);
		// Noa's own book may join it, but not hand it its own title.
		expect(
			(
				await as(NOA).post(`/v1/works/${own.workId}/merge`, {
					into: workId,
					keepTitle: true,
				})
			).status,
		).toBe(403);
		expect(await titleOf(workId)).toBe(title);
	});

	it("is not marked distinct by a stranger to both books", async () => {
		const { title, workId } = await shared();
		const own = await list(NOA, `${title} Returns`);
		expect(
			(await as(SAM).post(`/v1/works/${workId}/distinct`, { from: own.workId }))
				.status,
		).toBe(403);
		expect(
			(
				await as(NOA).post(`/v1/works/${workId}/distinct`, {
					from: "01J0NOSUCHWORK00000000000",
				})
			).status,
		).toBe(404);
		expect(
			(await as(NOA).post(`/v1/works/${workId}/distinct`, { from: own.workId }))
				.status,
		).toBe(204);
	});

	it("is tagged by a moderator only with the moderator's admin scope", async () => {
		const own = await list(NOA, `Noa's Own ${Date.now()}`, ["Noa"]);
		const minted = await as(DANA).post("/v1/me/tokens", {
			clientName: "Shelf helper",
			scopes: ["shelf:write"],
		});
		const tag = await env.DB.prepare("SELECT slug FROM tags LIMIT 1").first<{
			slug: string;
		}>();
		expect(
			(
				await api(
					{ token: minted.body.token },
					"PUT",
					`/v1/works/${own.workId}/tags`,
					{ tags: [tag!.slug] },
				)
			).status,
		).toBe(403);
	});
});
