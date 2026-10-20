import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, as, DANA, NOA, SAM } from "../test/api.ts";
import { rehostCovers } from "./covers.ts";

describe("openapi", () => {
	it("describes every route, publicly", async () => {
		const doc = await api(null, "GET", "/v1/openapi.json");
		expect(doc.status).toBe(200);
		expect(doc.body.openapi).toBe("3.1.0");
		expect(doc.body.servers).toEqual([{ url: "http://app.test/api" }]);
		expect(Object.keys(doc.body.paths).length).toBeGreaterThan(50);
		expect(doc.body.paths["/v1/loans/{id}/extend"].post.security).toEqual([
			{ bearer: ["loans:write"] },
		]);
		// The MCP server's OAuth tokens open the MCP server, not this API.
		expect(doc.body.components.securitySchemes).toEqual({
			bearer: expect.objectContaining({ scheme: "bearer" }),
		});
		// A listing's switches as the query string carries them.
		const browse = doc.body.paths["/v1/browse"].get.parameters.map(
			(parameter: { name: string }) => parameter.name,
		);
		expect(browse).toEqual(
			expect.arrayContaining(["availableOnly", "showMine", "showRead"]),
		);
		expect(browse).not.toContain("includeOwn");
	});
});

describe("personal tokens and scopes", () => {
	it("keeps a narrow token to what it was given", async () => {
		const minted = await as(SAM).post("/v1/me/tokens", {
			clientName: `narrow ${Date.now()}`,
			scopes: ["catalogue:read"],
		});
		const token = minted.body.token as string;
		expect((await api({ token }, "POST", "/v1/invites", {})).status).toBe(403);
		expect((await api({ token }, "GET", "/v1/me/tokens")).status).toBe(403);
		expect((await api({ token }, "GET", "/v1/me/webhooks")).status).toBe(403);
		expect(
			(await api({ token }, "PATCH", "/v1/me", { lendLimit: 3 })).status,
		).toBe(403);
	});

	it("lets an assistant set the lending limit but not the member's name", async () => {
		const minted = await as(SAM).post("/v1/me/tokens", {
			clientName: `shelf ${Date.now()}`,
			scopes: ["shelf:write"],
		});
		const token = minted.body.token as string;
		expect(
			(await api({ token }, "PATCH", "/v1/me", { lendLimit: 3 })).status,
		).toBe(204);
		expect(
			(await api({ token }, "PATCH", "/v1/me", { displayName: "Mallory" }))
				.status,
		).toBe(403);
		await as(SAM).patch("/v1/me", { lendLimit: null });
	});

	it("treats a moderator's token without the admin scope as a member's", async () => {
		const minted = await as(DANA).post("/v1/me/tokens", {
			clientName: `plain ${Date.now()}`,
			scopes: ["catalogue:read", "shelf:write"],
		});
		const token = minted.body.token as string;
		expect((await api({ token }, "GET", "/v1/admin/members")).status).toBe(403);
		const invite = await api({ token }, "POST", "/v1/invites", {
			maxUses: 50,
			days: 30,
		});
		// A member's invite, not a moderator's: one use, not fifty.
		expect(invite.status).toBe(201);
		const row = await env.DB.prepare(
			"SELECT max_uses FROM invites WHERE created_by = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
		)
			.bind(DANA)
			.first<{ max_uses: number }>();
		expect(row?.max_uses).toBe(1);
	});

	it("mints once, honours scopes, and never lets a token mint more", async () => {
		const minted = await as(SAM).post("/v1/me/tokens", {
			clientName: "script",
			scopes: ["catalogue:read"],
		});
		expect(minted.status).toBe(201);
		const token = minted.body.token as string;

		expect((await api({ token }, "GET", "/v1/browse")).status).toBe(200);
		const denied = await api({ token }, "GET", "/v1/me/loans");
		expect(denied.status).toBe(403);
		expect(denied.body.title).toBe("Scope missing");

		const more = await api({ token }, "POST", "/v1/me/tokens", {
			clientName: "x",
			scopes: ["admin"],
		});
		expect(more.status).toBe(403);

		const listed = await as(SAM).get("/v1/me/tokens");
		expect(listed.body.tokens[0].clientName).toBe("script");
		expect(listed.body.tokens[0].token).toBeUndefined();
	});

	it("admin scope is for moderators only", async () => {
		expect(
			(
				await as(SAM).post("/v1/me/tokens", {
					clientName: "x",
					scopes: ["admin"],
				})
			).status,
		).toBe(403);
		expect(
			(
				await as(DANA).post("/v1/me/tokens", {
					clientName: "x",
					scopes: ["admin"],
				})
			).status,
		).toBe(201);
	});

	it("unknown callers get 401, not 403", async () => {
		expect((await api(null, "GET", "/v1/me")).status).toBe(401);
		expect((await api({ token: "nope" }, "GET", "/v1/me")).status).toBe(401);
	});
});

describe("covers", () => {
	/**
	 * A book page must not point at a provider's server: their URL can rot, and
	 * every reader's browser would be telling them what is on our shelves.
	 */
	it("keeps its own copy of a cover a provider named", async () => {
		const added = await as(SAM).post("/v1/copies", {
			isbn13: "9780000000019",
		});
		expect(added.status).toBe(201);
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		expect(detail.body.edition.coverUrl).toMatch(/^http:\/\/covers\.test\//);
	});

	it("keeps its own copy of a cover a client names", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Cover ${Date.now()}`, authors: ["A. Stub"] },
		});
		const set = await as(SAM).patch(`/v1/copies/${added.body.id}`, {
			coverUrl: "https://covers.ok/b/id/2-M.jpg",
		});
		expect(set.status).toBe(204);
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		expect(detail.body.edition.coverUrl).toMatch(/^http:\/\/covers\.test\//);
	});

	it("takes the same book, saved twice in a row, as one copy", async () => {
		const title = `Twice ${Date.now()}`;
		const first = await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const second = await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(second.body.id).toBe(first.body.id);
		const row = await env.DB.prepare(
			`SELECT count(*) AS n FROM copies c JOIN editions e ON e.id = c.edition_id
			  WHERE c.owner_id = ? AND e.title = ?`,
		)
			.bind(SAM, title)
			.first<{ n: number }>();
		expect(row?.n).toBe(1);
	});

	it("refuses a cover it cannot fetch rather than linking to it", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `No cover ${Date.now()}`, authors: ["A. Stub"] },
		});
		const set = await as(SAM).patch(`/v1/copies/${added.body.id}`, {
			coverUrl: "https://elsewhere.test/cover.jpg",
		});
		expect(set.status).toBe(422);
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		expect(detail.body.edition.coverUrl).toBeNull();
	});

	it("does not take another host's covers path for its own", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Lookalike ${Date.now()}`, authors: ["A. Stub"] },
		});
		const set = await as(SAM).patch(`/v1/copies/${added.body.id}`, {
			coverUrl: "https://elsewhere.test/v1/covers/pixel.png",
		});
		expect(set.status).toBe(422);
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		expect(detail.body.edition.coverUrl).toBeNull();
	});

	it("leaves a shared edition's cover to all its owners", async () => {
		const mine = await as(SAM).post("/v1/copies", { isbn13: "9780000000019" });
		await as(DANA).post("/v1/copies", { isbn13: "9780000000019" });
		const swap = await as(SAM).patch(`/v1/copies/${mine.body.id}`, {
			coverUrl: "https://covers.ok/b/id/3-M.jpg",
		});
		expect(swap.status).toBe(409);
	});
});

describe("a copy's loan length", () => {
	it("is held to 90 days when listed, as when edited", async () => {
		const listed = await as(SAM).post("/v1/copies", {
			manual: { title: `Long Loan ${Date.now()}`, authors: ["A. Stub"] },
			loanDays: 1_000_000,
		});
		expect(listed.status).toBe(422);
	});
});

describe("covers already on somebody else's server", () => {
	it("are taken in by the sweep", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Sweep ${Date.now()}`, authors: ["A. Stub"] },
		});
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		// Straight into the table, as a row listed before covers were taken in.
		await env.DB.prepare("UPDATE editions SET cover_url = ? WHERE id = ?")
			.bind("https://covers.ok/b/id/9-M.jpg", detail.body.edition.id)
			.run();

		// The nightly pass (index.ts, scheduled), run now.
		const swept = await rehostCovers(env as never, 200);
		expect(swept.taken).toBeGreaterThan(0);

		const after = await as(SAM).get(`/v1/copies/${added.body.id}`);
		expect(after.body.edition.coverUrl).toMatch(/^http:\/\/covers\.test\//);
	});

	it("are not held up for good by addresses that are gone", async () => {
		const list = async (title: string, cover: string) => {
			const added = await as(SAM).post("/v1/copies", {
				manual: { title: `${title} ${Date.now()}`, authors: ["A. Stub"] },
			});
			const { body } = await as(SAM).get(`/v1/copies/${added.body.id}`);
			await env.DB.prepare("UPDATE editions SET cover_url = ? WHERE id = ?")
				.bind(cover, body.edition.id)
				.run();
			return added.body.id as string;
		};
		// Two dead addresses ahead of a live one, and a pass of two at a time.
		await list("Dead one", "https://gone.example/1.jpg");
		await list("Dead two", "https://gone.example/2.jpg");
		const live = await list("Live", "https://covers.ok/b/id/12-M.jpg");
		await env.DB.prepare(
			"UPDATE editions SET cover_tried_at = NULL WHERE cover_url LIKE 'https://gone.example/%'",
		).run();

		expect(await rehostCovers(env as never, 2)).toEqual({
			taken: 0,
			failed: 2,
		});
		// The next night the live one gets its turn.
		expect((await rehostCovers(env as never, 2)).taken).toBe(1);
		const after = await as(SAM).get(`/v1/copies/${live}`);
		expect(after.body.edition.coverUrl).toMatch(/^http:\/\/covers\.test\//);
	});

	it("are fetched once, however many books name the same image", async () => {
		const first = await as(SAM).post("/v1/copies", {
			manual: {
				title: `Shared cover A ${Date.now()}`,
				authors: ["A. Stub"],
				coverUrl: "https://covers.ok/b/id/11-M.jpg",
			},
		});
		const second = await as(DANA).post("/v1/copies", {
			manual: {
				title: `Shared cover B ${Date.now()}`,
				authors: ["A. Stub"],
				coverUrl: "https://covers.ok/b/id/11-M.jpg",
			},
		});
		const [one, two] = await Promise.all([
			as(SAM).get(`/v1/copies/${first.body.id}`),
			as(DANA).get(`/v1/copies/${second.body.id}`),
		]);
		expect(one.body.edition.coverUrl).toMatch(/^http:\/\/covers\.test\//);
		expect(two.body.edition.coverUrl).toBe(one.body.edition.coverUrl);
	});
});

describe("one member's shelf, seen from a book page", () => {
	it("browses only that member's copies", async () => {
		const mine = await as(SAM).post("/v1/copies", {
			manual: { title: `Sam only ${Date.now()}`, authors: ["A. Stub"] },
		});
		await as(DANA).post("/v1/copies", {
			manual: { title: `Dana only ${Date.now()}`, authors: ["A. Stub"] },
		});

		const page = await as(DANA).get(`/v1/browse?owner=${SAM}`);
		expect(page.status).toBe(200);
		const owners = page.body.results.flatMap((listing: any) =>
			listing.copies.map((copy: any) => copy.owner.id),
		);
		expect(owners.length).toBeGreaterThan(0);
		expect([...new Set(owners)]).toEqual([SAM]);
		const ids = page.body.results.flatMap((listing: any) =>
			listing.copies.map((copy: any) => copy.id),
		);
		expect(ids).toContain(mine.body.id);
	});

	it("shows a member their own shelf by the same route", async () => {
		const mine = await as(SAM).post("/v1/copies", {
			manual: { title: `Sam again ${Date.now()}`, authors: ["A. Stub"] },
		});
		const page = await as(SAM).get(`/v1/browse?owner=${SAM}`);
		const ids = page.body.results.flatMap((listing: any) =>
			listing.copies.map((copy: any) => copy.id),
		);
		expect(ids).toContain(mine.body.id);
	});

	it("shows an empty shelf for an owner nobody is", async () => {
		const page = await as(SAM).get("/v1/browse?owner=nobody-at-all");
		expect(page.status).toBe(200);
		expect(page.body.results).toEqual([]);
	});
});

describe("a moderator correcting a book", () => {
	it("fixes the book's title, its note and its cover", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Wrong details ${Date.now()}`, authors: ["A. Stub"] },
		});
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		const workId = detail.body.work.id;

		const edited = await as(DANA).patch(`/v1/admin/works/${workId}`, {
			title: "Corrected Title",
			note: "Second edition, 1998. Translated from the Hebrew.",
			coverUrl: "https://covers.ok/b/id/21-M.jpg",
		});
		expect(edited.status).toBe(200);

		const after = await as(SAM).get(`/v1/copies/${added.body.id}`);
		expect(after.body.edition.title).toBe("Corrected Title");
		expect(after.body.work.note).toBe(
			"Second edition, 1998. Translated from the Hebrew.",
		);
		expect(after.body.edition.coverUrl).toMatch(/^http:\/\/covers\.test\//);
		// On the book's page too, where everyone reads it.
		expect((await as(SAM).get(`/v1/works/${workId}`)).body.work.note).toBe(
			"Second edition, 1998. Translated from the Hebrew.",
		);
	});

	it("clears a detail that was wrong rather than only replacing it", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Clear me ${Date.now()}`, authors: ["A. Stub"] },
		});
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		await as(DANA).patch(`/v1/admin/works/${detail.body.work.id}`, {
			note: "Wrong note",
		});
		await as(DANA).patch(`/v1/admin/works/${detail.body.work.id}`, {
			note: null,
			coverUrl: null,
		});
		const after = await as(SAM).get(`/v1/copies/${added.body.id}`);
		expect(after.body.work.note).toBeNull();
		expect(after.body.edition.coverUrl).toBeNull();
	});

	it("will not guess which edition when there are two", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Two editions ${Date.now()}`, authors: ["A. Stub"] },
		});
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		// A second edition of the same work, as a reprint would be.
		await env.DB.prepare(
			`INSERT INTO editions (id, work_id, title, search_key, created_at)
			 VALUES (?, ?, ?, ?, ?)`,
		)
			.bind(
				"01M2EDITION000000000000002",
				detail.body.work.id,
				detail.body.edition.title,
				"two editions",
				Math.floor(Date.now() / 1000),
			)
			.run();

		const refused = await as(DANA).patch(
			`/v1/admin/works/${detail.body.work.id}`,
			{ coverUrl: "https://covers.ok/b/id/22-M.jpg" },
		);
		expect(refused.status).toBe(409);
		// The title still goes through: that belongs to the work.
		const renamed = await as(DANA).patch(
			`/v1/admin/works/${detail.body.work.id}`,
			{ title: "Renamed anyway" },
		);
		expect(renamed.status).toBe(200);
	});

	it("is the only one who may", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Not yours ${Date.now()}`, authors: ["A. Stub"] },
		});
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);
		const refused = await as(SAM).patch(
			`/v1/admin/works/${detail.body.work.id}`,
			{ title: "Sam's idea" },
		);
		expect(refused.status).toBe(403);
	});
});

describe("ordering the shelves and narrowing them", () => {
	it("hides what cannot be borrowed today when asked", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Paused ${Date.now()}`, authors: ["A. Stub"] },
		});
		await as(SAM).patch(`/v1/copies/${added.body.id}`, {
			lending: "reference",
		});

		const all = await as(DANA).get("/v1/browse?limit=240");
		const only = await as(DANA).get("/v1/browse?limit=240&availableOnly=1");
		const ids = (page: any) =>
			page.body.results.flatMap((listing: any) =>
				listing.copies.map((copy: any) => copy.id),
			);
		expect(ids(all)).toContain(added.body.id);
		expect(ids(only)).not.toContain(added.body.id);
		for (const listing of only.body.results) {
			expect(listing.available).toBeGreaterThan(0);
		}
	});

	it("sorts by title, in both alphabets", async () => {
		const stamp = Date.now();
		for (const title of [
			`${stamp} Zebra`,
			`${stamp} Apple`,
			`${stamp} Mango`,
		]) {
			await as(SAM).post("/v1/copies", {
				manual: { title, authors: ["A. Stub"] },
			});
		}
		const page = await as(DANA).get("/v1/browse?limit=240&sort=title");
		const mine = page.body.results
			.map((listing: any) => listing.work.title)
			.filter((title: string) => title.startsWith(String(stamp)));
		expect(mine).toEqual([
			`${stamp} Apple`,
			`${stamp} Mango`,
			`${stamp} Zebra`,
		]);
	});

	it("sorts by distance, with the unplaced last", async () => {
		const page = await as(DANA).get("/v1/browse?limit=240&sort=distance");
		const distances = page.body.results.map((listing: any) => listing.nearestM);
		const placed = distances.filter((one: number | null) => one !== null);
		expect(placed).toEqual([...placed].sort((a: number, b: number) => a - b));
		// Once a null appears, everything after it is null too.
		const firstNull = distances.indexOf(null);
		if (firstNull !== -1) {
			expect(
				distances.slice(firstNull).every((one: null) => one === null),
			).toBe(true);
		}
	});

	it("keeps newest first when nothing is asked for", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Newest ${Date.now()}`, authors: ["A. Stub"] },
		});
		const page = await as(DANA).get("/v1/browse?limit=5");
		const ids = page.body.results.flatMap((listing: any) =>
			listing.copies.map((copy: any) => copy.id),
		);
		expect(ids).toContain(added.body.id);
	});
});

describe("your own books on the shelves", () => {
	const ids = (page: any) =>
		page.body.results.flatMap((listing: any) =>
			listing.copies.map((copy: any) => copy.id),
		);

	it("stay out of browsing until you ask for them", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Mine ${Date.now()}`, authors: ["A. Stub"] },
		});

		const hidden = await as(SAM).get("/v1/browse?limit=240");
		expect(ids(hidden)).not.toContain(added.body.id);
		for (const listing of hidden.body.results) {
			for (const copy of listing.copies) expect(copy.mine).toBe(false);
		}

		const shown = await as(SAM).get("/v1/browse?limit=240&showMine=1");
		expect(ids(shown)).toContain(added.body.id);
	});

	it("stay out of a search too", async () => {
		const title = `Searchable mine ${Date.now()}`;
		const added = await as(SAM).post("/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const query = `q=${encodeURIComponent(title)}`;
		expect(
			(await as(SAM).get(`/v1/search?${query}`)).body.results,
		).toHaveLength(0);

		const shown = await as(SAM).get(`/v1/search?${query}&showMine=1`);
		expect(shown.body.results).toHaveLength(1);
		expect(shown.body.results[0].copies[0].id).toBe(added.body.id);
	});

	it("are there when it is your own shelf you asked for", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `My shelf ${Date.now()}`, authors: ["A. Stub"] },
		});
		const page = await as(SAM).get(`/v1/browse?limit=240&owner=${SAM}`);
		expect(ids(page)).toContain(added.body.id);
	});

	it("are still there for everybody else", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Sam's ${Date.now()}`, authors: ["A. Stub"] },
		});
		const page = await as(DANA).get("/v1/browse?limit=240");
		expect(ids(page)).toContain(added.body.id);
	});
});

describe("the moderator's asset list", () => {
	it("names the book each copy belongs to", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Asset ${Date.now()}`, authors: ["A. Stub"] },
		});
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);

		const listed = await as(DANA).get("/v1/admin/copies");
		const row = listed.body.copies.find(
			(copy: any) => copy.id === added.body.id,
		);
		expect(row.workId).toBe(detail.body.work.id);
		// The page links straight there, so the id has to open something.
		const page = await as(DANA).get(`/v1/works/${row.workId}`);
		expect(page.status).toBe(200);
	});
});

describe("moderating a reported conversation", () => {
	async function reportedLoan() {
		const { activeLoan } = await import("../test/api.ts");
		const copy = await as(DANA).post("/v1/copies", {
			manual: { title: `Flagged ${Date.now()}`, authors: ["A. Stub"] },
		});
		const loan = await activeLoan(SAM, DANA, copy.body.id);
		await as(SAM).post(`/v1/loans/${loan}/messages`, {
			body: "See you at six",
		});
		const report = await as(SAM).post(`/v1/loans/${loan}/report`, {
			kind: "conduct",
			body: "Was rude about it",
		});
		return { loanId: loan, reportId: report.body.id as string };
	}

	it("opens the thread to a moderator", async () => {
		const { loanId, reportId } = await reportedLoan();
		const page = await as(DANA).get(`/v1/admin/reports/${reportId}/thread`);
		expect(page.status).toBe(200);
		expect(page.body.loanId).toBe(loanId);
		expect(page.body.report.kind).toBe("conduct");
		expect(page.body.messages.map((m: any) => m.body)).toContain(
			"See you at six",
		);
		// Both sides are named, so a moderator can tell who said what.
		expect(Object.keys(page.body.participants)).toHaveLength(2);
	});

	it("is closed to everybody else", async () => {
		const { reportId } = await reportedLoan();
		const refused = await as(SAM).get(`/v1/admin/reports/${reportId}/thread`);
		expect(refused.status).toBe(403);
	});

	it("does not open a conversation nobody reported", async () => {
		const missing = await as(DANA).get(
			"/v1/admin/reports/01M2NOSUCHREPORT000000000/thread",
		);
		expect(missing.status).toBe(404);
	});

	it("reads only; there is no way to write into the thread", async () => {
		const { reportId } = await reportedLoan();
		const posted = await api(
			{ member: DANA },
			"POST",
			`/v1/admin/reports/${reportId}/thread`,
			{ body: "Moderator here" },
		);
		expect(posted.status).toBe(404);
	});
});

describe("a member on holiday", () => {
	const inAWeek = () => Math.floor(Date.now() / 1000) + 7 * 86_400;

	async function away(until: number | null) {
		const set = await as(SAM).patch("/v1/me", { awayUntil: until });
		expect(set.status).toBe(204);
	}

	it("keeps their books listed but marked away", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Holiday ${Date.now()}`, authors: ["A. Stub"] },
		});
		await away(inAWeek());

		const page = await as(DANA).get("/v1/browse?limit=240");
		const copies = page.body.results.flatMap((listing: any) => listing.copies);
		const mine = copies.find((copy: any) => copy.id === added.body.id);
		expect(mine, "the book should stay in the catalogue").toBeDefined();
		expect(mine.available).toBe(false);
		expect(mine.ownerAway).toBe(true);
		expect(mine.ownerBackOn).toBeGreaterThan(Math.floor(Date.now() / 1000));

		await away(null);
	});

	it("is left out when only what can be borrowed is asked for", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Holiday filter ${Date.now()}`, authors: ["A. Stub"] },
		});
		await away(inAWeek());
		const only = await as(DANA).get("/v1/browse?limit=240&availableOnly=1");
		const ids = only.body.results.flatMap((listing: any) =>
			listing.copies.map((copy: any) => copy.id),
		);
		expect(ids).not.toContain(added.body.id);
		await away(null);
	});

	it("cannot be asked for a book until they are back", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Holiday ask ${Date.now()}`, authors: ["A. Stub"] },
		});
		await away(inAWeek());
		const refused = await as(DANA).post("/v1/loans", { copyId: added.body.id });
		expect(refused.status).toBe(409);
		expect(refused.body.title).toBe("Away");

		// Back early: the same request goes through.
		await away(null);
		const asked = await as(DANA).post("/v1/loans", { copyId: added.body.id });
		expect(asked.status).toBe(201);
	});

	it("says on their profile whether they are away", async () => {
		await away(inAWeek());
		expect((await as(SAM).get("/v1/me")).body.awayUntil).toBeGreaterThan(
			Math.floor(Date.now() / 1000),
		);
		await away(null);
		expect((await as(SAM).get("/v1/me")).body.awayUntil).toBeNull();
	});

	it("forgets a holiday that has been and gone", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Holiday over ${Date.now()}`, authors: ["A. Stub"] },
		});
		await env.DB.prepare("UPDATE members SET away_until = ? WHERE id = ?")
			.bind(Math.floor(Date.now() / 1000) - 86_400, SAM)
			.run();

		expect((await as(SAM).get("/v1/me")).body.awayUntil).toBeNull();
		const asked = await as(DANA).post("/v1/loans", { copyId: added.body.id });
		expect(asked.status).toBe(201);
	});
});

describe("connections to an assistant", () => {
	const scopes = ["catalogue:read"];
	const approve = () =>
		as(SAM).post("/v1/oauth/approve", { clientName: "Claude", scopes });
	/** The assistant collects the connection, as the OAuth server does. */
	const collect = async (code: string) => {
		const { redeemConsent } = await import("./tokens-store.ts");
		return redeemConsent(env, code);
	};
	const claude = async () =>
		(await as(SAM).get("/v1/me/tokens")).body.tokens.filter(
			(token: any) => token.clientName === "Claude",
		);

	it("replaces the last one rather than piling up", async () => {
		await collect((await approve()).body.code);
		await collect((await approve()).body.code);
		await collect((await approve()).body.code);
		expect(await claude()).toHaveLength(1);
	});

	it("keeps the working one until the new one is collected", async () => {
		const first = await collect((await approve()).body.code);
		// Approved again, then abandoned before the assistant collected it.
		await approve();
		expect(await claude()).toHaveLength(1);
		const { api } = await import("../test/api.ts");
		expect((await api({ token: first!.token }, "GET", "/v1/tags")).status).toBe(
			200,
		);
	});

	it("does not touch another assistant's connection", async () => {
		await collect((await approve()).body.code);
		const other = await as(SAM).post("/v1/oauth/approve", {
			clientName: "Something else",
			scopes,
		});
		await collect(other.body.code);
		const names = (await as(SAM).get("/v1/me/tokens")).body.tokens.map(
			(token: any) => token.clientName,
		);
		expect(names).toContain("Claude");
		expect(names).toContain("Something else");
	});

	it("drops an approval the assistant never collected", async () => {
		await approve();
		// Waiting to be collected: not a connection, and not listed as one.
		expect(await claude()).toHaveLength(0);

		// The five minutes are up and nobody redeemed the code.
		await env.DB.prepare(
			"UPDATE consent_codes SET expires_at = ? WHERE used_at IS NULL",
		)
			.bind(Math.floor(Date.now() / 1000) - 1)
			.run();
		const { revokeAbandonedConsents } = await import("./tokens-store.ts");
		expect(await revokeAbandonedConsents(env)).toBeGreaterThan(0);

		const left = (await as(SAM).get("/v1/me/tokens")).body.tokens.filter(
			(token: any) => token.clientName === "Claude",
		);
		expect(left).toHaveLength(0);
	});
});

describe("writing to whoever runs the library", () => {
	it("takes a message from a member and keeps it", async () => {
		const sent = await as(SAM).post("/v1/contact", {
			topic: "feedback",
			body: "The Hebrew search could be kinder about niqqud",
		});
		expect(sent.status).toBe(201);

		const row = await env.DB.prepare(
			"SELECT member_id, email, topic, handled_at FROM contact_messages WHERE id = ?",
		)
			.bind(sent.body.id)
			.first<{
				member_id: string;
				email: string;
				topic: string;
				handled_at: number | null;
			}>();
		expect(row!.member_id).toBe(SAM);
		expect(row!.email).toBe("sam@example.com");
		expect(row!.topic).toBe("feedback");
		expect(row!.handled_at).toBeNull();
	});

	it("takes one from somebody with no account, who gives an address", async () => {
		const sent = await api(null, "POST", "/v1/contact", {
			topic: "data",
			body: "Please delete everything you hold about me",
			email: "gone@example.com",
		});
		expect(sent.status).toBe(201);
		const row = await env.DB.prepare(
			"SELECT member_id, email FROM contact_messages WHERE id = ?",
		)
			.bind(sent.body.id)
			.first<{ member_id: string | null; email: string }>();
		expect(row!.member_id).toBeNull();
		expect(row!.email).toBe("gone@example.com");
	});

	it("refuses a message with nowhere to answer", async () => {
		const sent = await api(null, "POST", "/v1/contact", {
			topic: "complaint",
			body: "Something went wrong",
		});
		expect(sent.status).toBe(422);
	});

	it("refuses an empty message", async () => {
		expect(
			(await as(SAM).post("/v1/contact", { topic: "feedback", body: "   " }))
				.status,
		).toBe(422);
	});

	it("limits how many one caller can send", async () => {
		const send = () =>
			as(SAM).post("/v1/contact", { topic: "feedback", body: "again" });
		for (let i = 0; i < 5; i += 1) expect((await send()).status).toBe(201);
		const refused = await send();
		expect(refused.status).toBe(429);
		expect(refused.body.title).toBe("Too many messages");
	});
});

describe("a book that arrived damaged from the last reader", () => {
	it("names the reader who passed it on, not the owner", async () => {
		const { activeLoan } = await import("../test/api.ts");
		const copy = await as(DANA).post("/v1/copies", {
			manual: { title: `Relayed ${Date.now()}`, authors: ["A. Stub"] },
			relayAllowed: true,
		});
		// Sam has it; Noa asks to be next, which is a relay from Sam.
		await activeLoan(SAM, DANA, copy.body.id);
		const relay = await as(NOA).post("/v1/loans", { copyId: copy.body.id });
		expect(relay.status).toBe(201);
		expect(relay.body.relay).toBe(true);
		await as(SAM)
			.post(`/v1/loans/${relay.body.id}/accept`)
			.catch(() => null);

		const filed = await as(NOA).post(`/v1/loans/${relay.body.id}/report`, {
			kind: "damage",
			body: "The spine was already split",
		});
		expect(filed.status).toBe(201);

		const row = await env.DB.prepare(
			"SELECT subject_member FROM reports WHERE id = ?",
		)
			.bind(filed.body.id)
			.first<{ subject_member: string }>();
		// Sam handed it over, so Sam is who the report is about.
		expect(row!.subject_member).toBe(SAM);

		// The owner was not at the handover, so they are told.
		const messages = await (
			env.NOTIFY as unknown as {
				sentMessages(): Promise<{ kind: string; to: string }[]>;
			}
		).sentMessages();
		const toOwner = messages.find(
			(message) =>
				message.kind === "copy_damage" && message.to === "dana@example.com",
		);
		expect(toOwner, "the owner should hear about it").toBeDefined();
	});

	it("still names the other party on an ordinary loan", async () => {
		const { activeLoan } = await import("../test/api.ts");
		const copy = await as(DANA).post("/v1/copies", {
			manual: { title: `Direct ${Date.now()}`, authors: ["A. Stub"] },
		});
		const loan = await activeLoan(SAM, DANA, copy.body.id);
		const filed = await as(SAM).post(`/v1/loans/${loan}/report`, {
			kind: "damage",
		});
		const row = await env.DB.prepare(
			"SELECT subject_member FROM reports WHERE id = ?",
		)
			.bind(filed.body.id)
			.first<{ subject_member: string }>();
		expect(row!.subject_member).toBe(DANA);
	});
});

describe("the queue for a book", () => {
	it("is not offered to somebody who owns a copy", async () => {
		const added = await as(SAM).post("/v1/copies", {
			manual: { title: `Already mine ${Date.now()}`, authors: ["A. Stub"] },
		});
		const detail = await as(SAM).get(`/v1/copies/${added.body.id}`);

		const refused = await as(SAM).post("/v1/waitlist", {
			workId: detail.body.work.id,
		});
		expect(refused.status).toBe(409);
		expect(refused.body.title).toBe("Already yours");

		// Anybody else may still wait for it.
		expect(
			(await as(DANA).post("/v1/waitlist", { workId: detail.body.work.id }))
				.status,
		).toBe(201);
	});
});
