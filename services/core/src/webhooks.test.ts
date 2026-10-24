import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activeLoan, as, COPY_A, COPY_B, DANA, NOA, SAM } from "../test/api.ts";
import { deliverPending, post, sign } from "./events.ts";

const kindsFor = async (member: string) =>
	(await as(member).get("/v1/events")).body.events.map((e: any) => e.kind);

describe("events", () => {
	it("the replay cursor follows the order events were written", async () => {
		const FINCH = "01J0COMMUNITY0000000FINCH";
		const write = (id: string) =>
			env.DB.prepare(
				`INSERT INTO events (id, community_id, kind, data, audience, created_at)
				 VALUES (?, ?, 'copy.state_changed', '{}', '*', unixepoch())`,
			)
				.bind(id, FINCH)
				.run();
		// Two written at once, the second with the lower id.
		await write("01M00000000000000000000002");
		const first = await as(SAM).get("/v1/events");
		const cursor = first.body.events.at(-1).id;
		await write("01M00000000000000000000001");
		const next = await as(SAM).get(`/v1/events?since=${cursor}`);
		expect(next.body.events.map((event: { id: string }) => event.id)).toEqual([
			"01M00000000000000000000001",
		]);
	});

	it("the reader who handed a copy on stops hearing about the next loan", async () => {
		await activeLoan(SAM, DANA, COPY_A);
		const relay = (await as(NOA).post("/v1/loans", { copyId: COPY_A })).body.id;
		await as(DANA).post(`/v1/loans/${relay}/accept`);
		const aboutRelay = async () =>
			(await as(SAM).get("/v1/events")).body.events.filter(
				(event: { data: { loanId?: string } }) => event.data.loanId === relay,
			).length;
		// Before the handover Sam is part of it.
		expect(await aboutRelay()).toBeGreaterThan(0);
		const known = await aboutRelay();
		await as(SAM).post(`/v1/loans/${relay}/handed`);
		await as(NOA).post(`/v1/loans/${relay}/report`, { kind: "loss" });
		expect(await aboutRelay()).toBe(known);
	});

	it("a loan's events reach its parties; the catalogue's reach everyone", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const sam = await kindsFor(SAM);
		expect(sam[0]).toBe("loan.requested");
		expect([...sam].sort()).toEqual([
			"copy.state_changed",
			"copy.state_changed",
			"loan.accepted",
			"loan.requested",
		]);
		expect(await kindsFor(NOA)).toEqual([
			"copy.state_changed",
			"copy.state_changed",
		]);

		const page = await as(SAM).get("/v1/events?limit=1");
		expect(page.body.events).toHaveLength(1);
		expect(page.body.next).toBe(page.body.events[0].id);
		const rest = await as(SAM).get(`/v1/events?since=${page.body.next}`);
		expect(rest.body.events).toHaveLength(3);
		expect(rest.body.next).toBeNull();
		const accepted = rest.body.events.find(
			(e: any) => e.kind === "loan.accepted",
		);
		expect(accepted.data).toMatchObject({
			loanId: id,
			copyId: COPY_B,
			borrowerId: SAM,
			lenderId: DANA,
		});
	});

	it("listing a copy is an event; deleting it is a retirement", async () => {
		const added = await as(SAM).post("/v1/copies", {
			isbn13: "9780000000002",
			relayAllowed: true,
		});
		expect(added.status).toBe(201);
		expect((await as(SAM).del(`/v1/copies/${added.body.id}`)).status).toBe(204);
		expect(await kindsFor(NOA)).toEqual(["copy.listed", "copy.retired"]);
	});
});

describe("webhooks", () => {
	it("needs https and a session; the secret shows once", async () => {
		const plain = await as(SAM).post("/v1/me/webhooks", {
			url: "http://example.com/hook",
		});
		expect(plain.status).toBe(422);
		const ok = await as(SAM).post("/v1/me/webhooks", {
			url: "https://hooks.ok/hook",
			kinds: ["loan.accepted"],
		});
		expect(ok.status).toBe(201);
		expect(ok.body.secret).toMatch(/^whsec_/);
		expect(ok.body.kinds).toEqual(["loan.accepted"]);
		const listed = await as(SAM).get("/v1/me/webhooks");
		expect(listed.body.webhooks).toHaveLength(1);
		expect(listed.body.webhooks[0].secret).toBeUndefined();
	});

	it("delivers matching kinds only, and marks the outcome", async () => {
		const hook = await as(SAM).post("/v1/me/webhooks", {
			url: "https://hooks.ok/in",
			kinds: ["loan.accepted"],
		});
		await activeLoan(SAM, DANA, COPY_B);
		const deliveries = await as(SAM).get(
			`/v1/me/webhooks/${hook.body.id}/deliveries`,
		);
		expect(deliveries.body.deliveries).toHaveLength(1);
		expect(deliveries.body.deliveries[0]).toMatchObject({
			kind: "loan.accepted",
			status: "delivered",
			attempts: 1,
			lastStatus: 200,
		});
		const view = (await as(SAM).get("/v1/me/webhooks")).body.webhooks[0];
		expect(view).toMatchObject({ failures: 0, lastStatus: 200 });
	});

	it("keeps a failed delivery pending for a retry and counts the failure", async () => {
		const hook = await as(SAM).post("/v1/me/webhooks", {
			url: "https://hooks.down/in",
			kinds: ["loan.requested"],
		});
		await as(SAM).post("/v1/loans", { copyId: COPY_B });
		const delivery = (
			await as(SAM).get(`/v1/me/webhooks/${hook.body.id}/deliveries`)
		).body.deliveries[0];
		expect(delivery).toMatchObject({
			status: "pending",
			attempts: 1,
			lastStatus: 503,
		});
		expect(delivery.nextAt).toBeGreaterThan(delivery.createdAt);
		expect(
			(await as(SAM).get("/v1/me/webhooks")).body.webhooks[0].failures,
		).toBe(1);

		const ping = await as(SAM).post(`/v1/me/webhooks/${hook.body.id}/test`);
		expect(ping.status).toBe(202);
		expect(ping.body).toEqual({ ok: false, status: 503 });
	});

	it("counts every failed delivery of one pass towards switching the hook off", async () => {
		const hook = await as(SAM).post("/v1/me/webhooks", {
			url: "https://hooks.down/in",
		});
		await activeLoan(SAM, DANA, COPY_B);
		const failures = async () =>
			(await as(SAM).get("/v1/me/webhooks")).body.webhooks[0].failures;
		const before = await failures();
		// Four deliveries, all due again, drained by a single pass.
		await env.DB.prepare(
			"UPDATE webhook_deliveries SET next_at = 0 WHERE webhook_id = ?",
		)
			.bind(hook.body.id)
			.run();
		expect(await deliverPending(env)).toBe(0);
		expect(await failures()).toBe(before + 4);
	});

	it("does not deliver another member's loan to a bystander's hook", async () => {
		await as(NOA).post("/v1/me/webhooks", { url: "https://hooks.ok/noa" });
		await activeLoan(SAM, DANA, COPY_A);
		const kinds = (
			await env.DB.prepare(
				"SELECT e.kind FROM webhook_deliveries d JOIN events e ON e.id = d.event_id ORDER BY e.id",
			).all()
		).results.map((r: any) => r.kind);
		expect(kinds).toEqual(["copy.state_changed", "copy.state_changed"]);
	});

	it("signs with HMAC-SHA256 over timestamp.body", async () => {
		const a = await sign("secret", "1.{}");
		const b = await sign("secret", "2.{}");
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toBe(b);
		expect(await sign("secret", "1.{}")).toBe(a);
		// RFC 4231, test case 2: what any receiver's HMAC-SHA256 gives.
		expect(await sign("Jefe", "what do ya want for nothing?")).toBe(
			"5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
		);
	});

	describe("a delivery", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("carries what a receiver checks: the kind, the id, and a signature over its time and body", async () => {
			const sent = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValue(new Response(null, { status: 204 }));
			const event = {
				id: "01J0EVENT000000000000000AA",
				kind: "loan.accepted",
				data: { loanId: "01J0LOAN000000000000000000" },
				createdAt: 1_700_000_000,
			};
			const outcome = await post("https://hooks.ok/in", "whsec", event);
			expect(outcome).toEqual({ ok: true, status: 204, error: null });

			const [url, init] = sent.mock.calls[0]!;
			expect(url).toBe("https://hooks.ok/in");
			// Never followed: a hook that redirects is not delivered to elsewhere.
			expect(init?.redirect).toBe("manual");
			const headers = new Headers(init?.headers);
			expect(headers.get("content-type")).toBe("application/json");
			expect(headers.get("x-cdl-event")).toBe("loan.accepted");
			expect(headers.get("x-cdl-delivery")).toBe(event.id);
			const body = String(init?.body);
			expect(JSON.parse(body)).toEqual(event);
			const [, time, signature] =
				/^t=(\d+),v1=([0-9a-f]{64})$/.exec(
					headers.get("x-cdl-signature") ?? "",
				) ?? [];
			expect(Math.abs(Number(time) - Date.now() / 1000)).toBeLessThan(5);
			expect(signature).toBe(await sign("whsec", `${time}.${body}`));
		});

		it("is a failure when the hook answers with a redirect", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(
				new Response(null, {
					status: 302,
					headers: { location: "https://elsewhere.example/" },
				}),
			);
			expect(
				await post("https://hooks.ok/in", "whsec", {
					id: "01J0EVENT000000000000000AB",
					kind: "ping",
					data: {},
					createdAt: 1_700_000_000,
				}),
			).toMatchObject({ ok: false, status: 302 });
		});
	});

	it("is removed with its deliveries", async () => {
		const hook = await as(SAM).post("/v1/me/webhooks", {
			url: "https://hooks.ok/x",
		});
		await activeLoan(SAM, DANA, COPY_B);
		const count = () =>
			env.DB.prepare("SELECT count(*) AS n FROM webhook_deliveries").first<{
				n: number;
			}>();
		expect((await count())?.n).toBe(4);
		expect((await as(SAM).del(`/v1/me/webhooks/${hook.body.id}`)).status).toBe(
			204,
		);
		expect((await as(SAM).del(`/v1/me/webhooks/${hook.body.id}`)).status).toBe(
			404,
		);
		expect((await count())?.n).toBe(0);
	});
});
