import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { as, DANA, SAM } from "../test/api.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";
const role = (value: string) =>
	env.DB.prepare(
		"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(value, DANA, FINCH)
		.run();

// The library's settings are the admin's. Each test starts from the
// fixtures (test/setup.ts), so the setting and the role go back by themselves.
beforeEach(() => role("admin"));

const settings = async () => (await as(DANA).get("/v1/admin/settings")).body;

describe("a library where everyone lives close by", () => {
	it("is set by the admin, and switches distances off", async () => {
		const before = await settings();
		expect(before.compact).toBe(false);
		expect((await as(SAM).get("/v1/me")).body.community.compact).toBe(false);

		expect(
			(await as(DANA).patch("/v1/admin/settings", { ...before, compact: true }))
				.status,
		).toBe(204);
		expect((await settings()).compact).toBe(true);
		expect((await as(SAM).get("/v1/me")).body.community.compact).toBe(true);
		const browse = (await as(SAM).get("/v1/browse?limit=40")).body;
		const distances = browse.results.flatMap(
			(work: { copies: { owner: { area: { distanceM: number | null } } }[] }) =>
				work.copies.map((copy) => copy.owner.area.distanceM),
		);
		expect(distances.length).toBeGreaterThan(0);
		expect(distances.every((metres: number | null) => metres === null)).toBe(
			true,
		);
		// Nor where anybody lives: not the name, not the cell for a map.
		const areas = browse.results.flatMap(
			(work: {
				copies: { owner: { area: { label: string; approx: unknown } } }[];
			}) => work.copies.map((copy) => copy.owner.area),
		);
		expect(
			areas.every(
				(area: { label: string; approx: unknown }) =>
					area.label === "" && area.approx === null,
			),
		).toBe(true);

		// Left out, it stays; set back, distances return.
		await as(DANA).patch("/v1/admin/settings", {
			...before,
			compact: undefined,
		});
		expect((await settings()).compact).toBe(true);
		await as(DANA).patch("/v1/admin/settings", { ...before, compact: false });
		expect((await settings()).compact).toBe(false);
	});

	it("does not need an area to save a name", async () => {
		expect((await as(SAM).patch("/v1/me", { displayName: "Sam" })).status).toBe(
			204,
		);
	});
});
