import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index.ts";

interface Point {
	blobs?: unknown[];
	doubles?: number[];
	indexes?: string[];
}

function sink(): { env: Env; points: Point[] } {
	const points: Point[] = [];
	return {
		points,
		env: {
			ANALYTICS: {
				// As Analytics Engine does: an index over 96 bytes is refused.
				writeDataPoint: (point: Point) => {
					for (const index of point.indexes ?? [])
						if (new TextEncoder().encode(index).length > 96)
							throw new TypeError("Size of indexes[0] exceeds 96 bytes");
					points.push(point);
				},
			} as unknown as NonNullable<Env["ANALYTICS"]>,
		},
	};
}

const post = (body: unknown, type = "application/reports+json") =>
	new Request("https://reports.test/csp", {
		method: "POST",
		headers: { "content-type": type, "user-agent": "a browser" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});

describe("the reports endpoint", () => {
	it("answers a health check", async () => {
		const response = await worker.fetch(
			new Request("https://reports.test/health"),
			sink().env,
		);
		expect(response.status).toBe(200);
	});

	it("turns a policy refusal into a row", async () => {
		const { env, points } = sink();
		const response = await worker.fetch(
			post([
				{
					type: "csp-violation",
					body: {
						documentURL: "https://library.test/shelf",
						effectiveDirective: "img-src",
						blockedURL: "https://elsewhere.test/cover.jpg",
						disposition: "enforce",
						lineNumber: 12,
					},
				},
			]),
			env,
		);
		expect(response.status).toBe(204);
		expect(points).toHaveLength(1);
		expect(points[0]!.blobs?.[0]).toBe("csp-violation");
		expect(points[0]!.blobs?.[2]).toBe("img-src");
		expect(points[0]!.blobs?.[3]).toBe("https://elsewhere.test/cover.jpg");
		expect(points[0]!.indexes).toEqual(["library.test"]);
	});

	it("keeps a long page's report, without the token in its address", async () => {
		const { env, points } = sink();
		const page =
			"https://our-street-library-of-books-and-things.example.org/auth/callback";
		await worker.fetch(
			post([
				{
					type: "csp-violation",
					body: {
						documentURL: `${page}?token=SIGN-IN-SECRET`,
						effectiveDirective: "script-src",
						blockedURL: "inline",
					},
				},
			]),
			env,
		);
		expect(points).toHaveLength(1);
		expect(JSON.stringify(points[0])).not.toContain("SIGN-IN-SECRET");
		expect(points[0]!.blobs?.[1]).toBe(page);
		expect(points[0]!.indexes).toEqual([
			"our-street-library-of-books-and-things.example.org",
		]);
	});

	it("reads the old csp-report shape too", async () => {
		const { env, points } = sink();
		await worker.fetch(
			post(
				{
					"csp-report": {
						"document-uri": "https://library.test/",
						"violated-directive": "script-src",
						"blocked-uri": "inline",
					},
				},
				"application/csp-report",
			),
			env,
		);
		expect(points[0]!.blobs?.[0]).toBe("csp-violation");
		expect(points[0]!.blobs?.[2]).toBe("script-src");
		expect(points[0]!.blobs?.[4]).toBe("enforce");
	});

	it("indexes a network error by the host that failed", async () => {
		const { env, points } = sink();
		await worker.fetch(
			post([
				{
					type: "network-error",
					body: {
						url: "https://library.test/works/1",
						type: "http.protocol.error",
						phase: "application",
						status_code: 0,
						method: "GET",
					},
				},
			]),
			env,
		);
		expect(points[0]!.blobs?.[0]).toBe("network-error");
		expect(points[0]!.indexes).toEqual(["library.test"]);
	});

	it("keeps a shape it does not know rather than dropping it", async () => {
		const { env, points } = sink();
		await worker.fetch(post([{ type: "deprecation", body: { id: "x" } }]), env);
		expect(points[0]!.blobs?.[0]).toBe("deprecation");
		expect(points[0]!.blobs?.[1]).toContain('"id":"x"');
	});

	it("takes nonsense without falling over", async () => {
		const { env, points } = sink();
		expect((await worker.fetch(post("not json at all"), env)).status).toBe(204);
		expect((await worker.fetch(post(""), env)).status).toBe(204);
		expect(points).toHaveLength(0);
	});

	it("refuses a body too big to be a report", async () => {
		const { env } = sink();
		const request = new Request("https://reports.test/csp", {
			method: "POST",
			headers: { "content-length": String(1024 * 1024) },
			body: "x".repeat(10),
		});
		expect((await worker.fetch(request, env)).status).toBe(413);
	});

	it("refuses anything but a post", async () => {
		const { env } = sink();
		const response = await worker.fetch(
			new Request("https://reports.test/csp"),
			env,
		);
		expect(response.status).toBe(405);
	});

	it("stops at twenty reports in one post", async () => {
		const { env, points } = sink();
		const many = Array.from({ length: 150 }, () => ({
			type: "csp-violation",
			body: { documentURL: "https://library.test/" },
		}));
		await worker.fetch(post(many), env);
		expect(points).toHaveLength(20);
	});
});

describe("crawlers", () => {
	it("are turned away", async () => {
		const response = await worker.fetch(
			new Request("https://reports.test/robots.txt"),
			sink().env,
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
	});
});
