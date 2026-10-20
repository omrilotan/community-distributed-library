import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { api, as, DANA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";

afterEach(async () => {
	await env.DB.batch([
		env.DB.prepare(
			"UPDATE memberships SET role = 'moderator' WHERE member_id = ? AND community_id = ?",
		).bind(DANA, FINCH),
		env.DB.prepare(
			`UPDATE communities SET name = 'Our Street', loan_days = 21,
			        member_invites_open = 5, member_invite_days = 14, texts = '{}',
			        languages = 'en,he', default_locale = 'en',
			        centre_lat = 51.6012, centre_lng = -0.1924, centre_label = NULL, radius_m = 3000, accent = NULL
			  WHERE id = ?`,
		).bind(FINCH),
	]);
});

describe("the library's settings", () => {
	it("are the admin's, and a member's invites follow them", async () => {
		const settings = {
			name: "Our Street Books",
			loanDays: 28,
			memberInvitesOpen: 0,
			memberInviteDays: 7,
		};
		expect((await as(DANA).patch("/v1/admin/settings", settings)).status).toBe(
			403,
		);
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		expect((await as(DANA).patch("/v1/admin/settings", settings)).status).toBe(
			204,
		);
		expect((await as(DANA).get("/v1/admin/settings")).body).toEqual({
			...settings,
			defaultLocale: "en",
			languages: ["en", "he"],
			compact: false,
			texts: {},
			centre: { label: "", lat: 51.6012, lng: -0.1924 },
			radiusM: 3000,
			accent: null,
		});
		// With no member invites allowed, a member cannot make one.
		expect((await as(SAM).post("/v1/invites", {})).status).toBe(403);
		expect(
			(await as(DANA).patch("/v1/admin/settings", { ...settings, loanDays: 0 }))
				.status,
		).toBe(422);
	});
});

describe("the library's words", () => {
	it("are the admin's to write per language, and are told to visitors", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const { texts: _, ...before } = (await as(DANA).get("/v1/admin/settings"))
			.body;
		const texts = {
			en: { tagline: "Neighbours lending books.", about: "For the street." },
			he: {
				name: "הספרייה",
				shortName: "ספרייה",
				tagline: "שכנים משאילים ספרים.",
			},
		};
		expect(
			(await as(DANA).patch("/v1/admin/settings", { ...before, texts })).status,
		).toBe(204);
		expect((await as(DANA).get("/v1/admin/settings")).body.texts).toEqual(
			texts,
		);
		expect((await api(null, "GET", "/v1/community")).body.texts).toEqual(texts);

		// Left out, the words stay.
		expect((await as(DANA).patch("/v1/admin/settings", before)).status).toBe(
			204,
		);
		expect((await api(null, "GET", "/v1/community")).body.texts).toEqual(texts);

		// A change to one language leaves the other's words as they were.
		expect(
			(
				await as(DANA).patch("/v1/admin/settings", {
					...before,
					texts: { en: { tagline: "Neighbours lending tools." } },
				})
			).status,
		).toBe(204);
		expect((await api(null, "GET", "/v1/community")).body.texts).toEqual({
			en: { tagline: "Neighbours lending tools." },
			he: texts.he,
		});

		// Only the languages a library can speak, and nothing endless.
		for (const bad of [
			{ fr: { name: "Bibliothèque" } },
			{ en: { about: "x".repeat(1001) } },
			{ en: { name: "" } },
			{ en: { shortName: "x".repeat(21) } },
		])
			expect(
				(await as(DANA).patch("/v1/admin/settings", { ...before, texts: bad }))
					.status,
			).toBe(422);
	});
});

describe("where the library is", () => {
	it("is the admin's to set: a place, its point, and how far it reaches", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const {
			texts: _,
			centre: __,
			radiusM: ___,
			...before
		} = (await as(DANA).get("/v1/admin/settings")).body;
		expect(
			(
				await as(DANA).patch("/v1/admin/settings", {
					...before,
					centre: { label: "Church End", lat: 51.6021, lng: -0.189 },
					radiusM: 800,
				})
			).status,
		).toBe(204);
		const after = (await as(DANA).get("/v1/admin/settings")).body;
		expect(after.centre).toEqual({
			label: "Church End",
			lat: 51.6021,
			lng: -0.189,
		});
		expect(after.radiusM).toBe(800);
		// Left out, they stay.
		expect((await as(DANA).patch("/v1/admin/settings", before)).status).toBe(
			204,
		);
		expect((await as(DANA).get("/v1/admin/settings")).body.radiusM).toBe(800);
		// Nothing absurd.
		expect(
			(await as(DANA).patch("/v1/admin/settings", { ...before, radiusM: 5 }))
				.status,
		).toBe(422);
	});
});

describe("the library's languages", () => {
	it("are the admin's to choose, and the default must be among them", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const { texts: _, ...before } = (await as(DANA).get("/v1/admin/settings"))
			.body;
		const save = async (change: object) =>
			(await as(DANA).patch("/v1/admin/settings", { ...before, ...change }))
				.status;

		// Hebrew only, while the default is still English: refused.
		expect(await save({ languages: ["he"] })).toBe(422);
		expect(await save({ languages: ["he"], defaultLocale: "he" })).toBe(204);
		const said = (await api(null, "GET", "/v1/community")).body;
		expect(said.languages).toEqual(["he"]);
		expect(said.defaultLocale).toBe("he");
		// Nor may the default move to a language not offered.
		expect(await save({ languages: undefined, defaultLocale: "en" })).toBe(422);

		// Both again, stored in one order whatever order they came in.
		expect(await save({ languages: ["he", "en"], defaultLocale: "en" })).toBe(
			204,
		);
		expect((await api(null, "GET", "/v1/community")).body.languages).toEqual([
			"en",
			"he",
		]);
		for (const bad of [[], ["fr"], ["en", "en"]])
			expect(await save({ languages: bad })).toBe(422);
	});
});

describe("a member's language", () => {
	it("is one the library offers", async () => {
		await env.DB.prepare(
			"UPDATE communities SET languages = 'he', default_locale = 'he' WHERE id = ?",
		)
			.bind(FINCH)
			.run();
		expect((await as(SAM).patch("/v1/me", { locale: "en" })).status).toBe(204);
		const row = await env.DB.prepare("SELECT locale FROM members WHERE id = ?")
			.bind(SAM)
			.first<{ locale: string }>();
		expect(row?.locale).toBe("he");
	});
});

describe("the library's language", () => {
	it("is the admin's to set, and is told to visitors", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const before = (await as(DANA).get("/v1/admin/settings")).body;
		const said = (await api(null, "GET", "/v1/community")).body;
		expect(said.defaultLocale).toBe(before.defaultLocale);
		expect(said.name).toBe(before.name);
		expect(said.type).toBe("books");
		expect(said.languages).toEqual(["en", "he"]);
		expect(
			(
				await as(DANA).patch("/v1/admin/settings", {
					...before,
					defaultLocale: "he",
				})
			).status,
		).toBe(204);
		expect((await api(null, "GET", "/v1/community")).body.defaultLocale).toBe(
			"he",
		);
		expect(
			(
				await as(DANA).patch("/v1/admin/settings", {
					...before,
					defaultLocale: "fr",
				})
			).status,
		).toBe(422);
		await as(DANA).patch("/v1/admin/settings", before);
	});
});

describe("the library's colour", () => {
	it("is the admin's to pick, is told to visitors, and goes back to the house green", async () => {
		await env.DB.prepare(
			"UPDATE memberships SET role = 'admin' WHERE member_id = ? AND community_id = ?",
		)
			.bind(DANA, FINCH)
			.run();
		const { texts: _, ...before } = (await as(DANA).get("/v1/admin/settings"))
			.body;
		const save = async (change: object) =>
			(await as(DANA).patch("/v1/admin/settings", { ...before, ...change }))
				.status;
		const told = async () =>
			(await api(null, "GET", "/v1/community")).body.accent;

		expect(await told()).toBeNull();
		// Stored in lower case, whatever case it came in.
		expect(await save({ accent: "#3366FF" })).toBe(204);
		expect(await told()).toBe("#3366ff");
		// Left out, it stays.
		expect(await save({ accent: undefined })).toBe(204);
		expect(await told()).toBe("#3366ff");
		for (const bad of ["red", "#36f", "#3366ffaa", "3366ff"])
			expect(await save({ accent: bad })).toBe(422);
		// The house green itself is the same as none.
		expect(await save({ accent: "#0b7361" })).toBe(204);
		expect(await told()).toBeNull();
		expect(await save({ accent: "#e91e63" })).toBe(204);
		expect(await save({ accent: null })).toBe(204);
		expect(await told()).toBeNull();
	});
});
