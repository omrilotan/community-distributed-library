import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY_A, DANA, SAM, as } from "../test/api.ts";
import type { Env } from "./env.ts";
import { kept, readRate, snapshot } from "./telemetry.ts";

const points = () => {
	const spy = vi.spyOn(env.EVENTS!, "writeDataPoint");
	return () =>
		spy.mock.calls.map(([point]) => ({
			blobs: point?.blobs,
			weight: point?.doubles?.[3],
		}));
};

describe("cdl_events", () => {
	afterEach(() => vi.restoreAllMocks());

	it("counts a request by its route, never its URL", async () => {
		const seen = points();
		await as(DANA).get(`/v1/copies/${COPY_A}`);
		const [point] = seen().filter((one) => one.blobs?.[0] === "request");
		expect(point?.blobs).toEqual([
			"request",
			"GET /v1/copies/:id",
			"2xx",
			"api",
		]);
		expect(point?.weight).toBe(1);
	});

	it("counts what happened in the library, by kind", async () => {
		const seen = points();
		await as(SAM).post("/v1/loans", { copyId: COPY_A });
		expect(seen().map((one) => one.blobs?.slice(0, 2))).toContainEqual([
			"domain",
			"loan.requested",
		]);
	});

	it("keeps a request's points together, at the share it is given", () => {
		const ids = Array.from({ length: 2000 }, (_, at) => `ray-${at}`);
		const share = ids.filter((id) => kept(id, 0.25)).length / ids.length;
		expect(share).toBeGreaterThan(0.2);
		expect(share).toBeLessThan(0.3);
		expect(kept("ray-7", 0.25)).toBe(kept("ray-7", 0.25));
		expect(ids.every((id) => kept(id, 1))).toBe(true);
	});

	it("counts every read for an hour after a deploy, and while boosted", () => {
		const at = Date.parse("2026-11-22T12:00:00Z");
		const with_ = (vars: Partial<Env>) =>
			readRate({ READS_SAMPLE_RATE: "0.1", ...vars } as Env, at);
		expect(with_({})).toBe(0.1);
		expect(with_({ DEPLOYED_AT: String(at - 600_000) })).toBe(1);
		expect(with_({ DEPLOYED_AT: String(at - 7200_000) })).toBe(0.1);
		expect(with_({ SAMPLING_BOOST_UNTIL: "2026-11-22T13:00:00Z" })).toBe(1);
		expect(with_({ READS_SAMPLE_RATE: "nonsense" })).toBe(1);
	});

	it("takes the day's numbers from the database, counts only", async () => {
		await env.DB.prepare("UPDATE members SET last_seen_at = ? WHERE id = ?")
			.bind(Math.floor(Date.now() / 1000), DANA)
			.run();
		const numbers = await snapshot(env);
		expect(numbers.members).toBe(3);
		expect(numbers.members_active_7d).toBe(1);
		expect(numbers.items).toBe(2);
		expect(Object.values(numbers).every((n) => typeof n === "number")).toBe(
			true,
		);
	});
});
