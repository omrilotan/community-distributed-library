import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { as, COPY_B, DANA, heard, SAM } from "../test/api.ts";

const subscribe = (member: string, endpoint: string) =>
	as(member).put("/v1/me/push", {
		endpoint,
		keys: { p256dh: "BPublicKey", auth: "AuthSecret" },
	});

const pending = () =>
	env.DB.prepare(
		"SELECT id, member_id, send_after, sent_at, dropped_at FROM pending_emails",
	).all<{
		id: string;
		member_id: string;
		send_after: number;
		sent_at: number | null;
		dropped_at: number | null;
	}>();

describe("push subscriptions", () => {
	it("keeps one row per browser and replaces it on re-subscribe", async () => {
		expect(
			(await subscribe(SAM, "https://fcm.googleapis.com/fcm/send/a")).status,
		).toBe(204);
		expect(
			(await subscribe(SAM, "https://fcm.googleapis.com/fcm/send/b")).status,
		).toBe(204);
		expect(
			(await subscribe(SAM, "https://fcm.googleapis.com/fcm/send/a")).status,
		).toBe(204);
		const rows = await env.DB.prepare(
			"SELECT count(*) AS n FROM push_subscriptions WHERE member_id = ?",
		)
			.bind(SAM)
			.first<{ n: number }>();
		expect(rows?.n).toBe(2);
	});

	it("needs a signed-in member and a complete subscription", async () => {
		const { api } = await import("../test/api.ts");
		expect(
			(
				await api(null, "PUT", "/v1/me/push", {
					endpoint: "https://fcm.googleapis.com/fcm/send/x",
				})
			).status,
		).toBe(401);
		expect(
			(
				await as(SAM).put("/v1/me/push", {
					endpoint: "https://fcm.googleapis.com/fcm/send/x",
				})
			).status,
		).toBe(422);
	});

	it("is removed when the browser says so", async () => {
		await subscribe(SAM, "https://fcm.googleapis.com/fcm/send/gone");
		expect(
			(
				await as(SAM).del(
					`/v1/me/push?endpoint=${encodeURIComponent("https://fcm.googleapis.com/fcm/send/gone")}`,
				)
			).status,
		).toBe(204);
		const left = await env.DB.prepare(
			"SELECT count(*) AS n FROM push_subscriptions WHERE endpoint = ?",
		)
			.bind("https://fcm.googleapis.com/fcm/send/gone")
			.first<{ n: number }>();
		expect(left?.n).toBe(0);
	});
});

describe("email follows a push, but only if it was missed", () => {
	it("queues the email instead of sending it when a push went out", async () => {
		await subscribe(DANA, "https://fcm.googleapis.com/fcm/send/dana");
		// Sam asks Dana for a book: Dana has a device, so the email waits.
		await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await heard();

		const queued = await pending();
		expect(queued.results).toHaveLength(1);
		expect(queued.results[0]).toMatchObject({
			member_id: DANA,
			sent_at: null,
			dropped_at: null,
		});
		// Five minutes' grace, give or take the clock.
		const wait = queued.results[0]!.send_after - Math.floor(Date.now() / 1000);
		expect(wait).toBeGreaterThan(4 * 60);
		expect(wait).toBeLessThanOrEqual(5 * 60);
	});

	it("emails at once when the member has no device", async () => {
		await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await heard();
		expect((await pending()).results).toHaveLength(0);
	});

	it("drops the email when they opened the app in the meantime", async () => {
		const { sendPendingEmails } = await import("./notify.ts");
		await subscribe(DANA, "https://fcm.googleapis.com/fcm/send/dana");
		await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await heard();

		// Dana looked at the app after the request arrived, and the wait elapsed.
		// last_seen_at is stamped by any authenticated call, throttled to once a
		// minute; set it here so the pass is what is under test.
		await env.DB.prepare("UPDATE members SET last_seen_at = ? WHERE id = ?")
			.bind(Math.floor(Date.now() / 1000) + 5, DANA)
			.run();
		await env.DB.prepare("UPDATE pending_emails SET send_after = 0").run();
		const result = await sendPendingEmails(env);
		expect(result).toEqual({ sent: 0, dropped: 1 });
		expect((await pending()).results).toHaveLength(0);
	});

	it("sends it when they did not", async () => {
		const { sendPendingEmails } = await import("./notify.ts");
		await subscribe(DANA, "https://fcm.googleapis.com/fcm/send/dana");
		await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await heard();

		// Nobody looked: the row is older than last_seen_at, so out it goes.
		await env.DB.prepare(
			"UPDATE pending_emails SET send_after = 0, created_at = ?",
		)
			.bind(Math.floor(Date.now() / 1000) + 60)
			.run();
		const result = await sendPendingEmails(env);
		expect(result).toEqual({ sent: 1, dropped: 0 });
		// Sent, and not kept: the words were only ever waiting to go out.
		expect((await pending()).results).toHaveLength(0);
	});

	it("is not cancelled by an assistant calling with a token", async () => {
		const { sendPendingEmails } = await import("./notify.ts");
		const { api } = await import("../test/api.ts");
		await subscribe(DANA, "https://fcm.googleapis.com/fcm/send/dana");
		const minted = await as(DANA).post("/v1/me/tokens", {
			clientName: "Poller",
			scopes: ["loans:read"],
		});
		await env.DB.prepare("UPDATE members SET last_seen_at = NULL WHERE id = ?")
			.bind(DANA)
			.run();
		await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await heard();
		// The assistant polls; Dana herself has not looked.
		await api({ token: minted.body.token }, "GET", "/v1/events");
		await env.DB.prepare("UPDATE pending_emails SET send_after = 0").run();
		expect(await sendPendingEmails(env)).toEqual({ sent: 1, dropped: 0 });
	});

	it("only takes the browsers' own push services", async () => {
		for (const endpoint of [
			"https://evil.example/push",
			"http://fcm.googleapis.com/fcm/send/x",
			"https://fcm.googleapis.com.evil.example/x",
		]) {
			expect((await subscribe(SAM, endpoint)).status).toBe(422);
		}
	});
});

describe("a push test", () => {
	it("goes to the one device asked about, and never by email", async () => {
		const endpoint = "https://fcm.googleapis.com/fcm/send/test-device";
		await subscribe(SAM, endpoint);
		const before = (await pending()).results.length;
		const tested = await as(SAM).post("/v1/me/push/test", { endpoint });
		expect(tested.status).toBe(200);
		expect(tested.body).toEqual({ sent: 1, known: true });
		expect((await pending()).results.length).toBe(before);
	});

	it("says so when the library does not know the device", async () => {
		const tested = await as(SAM).post("/v1/me/push/test", {
			endpoint: "https://fcm.googleapis.com/fcm/send/unknown",
		});
		expect(tested.body).toEqual({ sent: 0, known: false });
	});
});

describe("signing out", () => {
	it("stops that browser hearing the member's news", async () => {
		const { api } = await import("../test/api.ts");
		const asked = await api(null, "POST", "/v1/auth/magic-link", {
			email: "sam@example.com",
		});
		const link = new URL(asked.body.debugUrl).searchParams.get("token");
		const session = (
			await api(null, "POST", "/v1/auth/exchange", { token: link })
		).body.token as string;
		const endpoint = "https://fcm.googleapis.com/fcm/send/shared-laptop";
		expect(
			(
				await api({ token: session }, "PUT", "/v1/me/push", {
					endpoint,
					keys: { p256dh: "p", auth: "a" },
				})
			).status,
		).toBe(204);
		expect(
			(await api({ token: session }, "POST", "/v1/auth/logout")).status,
		).toBe(204);
		const left = await env.DB.prepare(
			"SELECT 1 FROM push_subscriptions WHERE endpoint = ?",
		)
			.bind(endpoint)
			.first();
		expect(left).toBeNull();
	});
});

describe("an email the service could not take", () => {
	it("is tried again later, not lost", async () => {
		const { tell } = await import("./notify.ts");
		await env.DB.prepare(
			`INSERT INTO members (id, email, display_name, locale, created_at)
			 VALUES ('01J0MEMBER0000000000DOWN0', 'reader@down.example', 'Down', 'en', 1)`,
		).run();
		await tell(env, {
			kind: "loan_nudge",
			to: "reader@down.example",
			locale: "en",
			url: "https://library.test/loans/x",
			bookTitle: "Oz",
			fromName: "Sam",
			stage: "due",
			days: 2,
		});
		const queued = await env.DB.prepare(
			"SELECT attempts, send_after - unixepoch() AS wait FROM pending_emails WHERE member_id = ?",
		)
			.bind("01J0MEMBER0000000000DOWN0")
			.first<{ attempts: number; wait: number }>();
		expect(queued?.attempts).toBe(1);
		expect(queued?.wait).toBeGreaterThan(10 * 60);
	});

	it("leaves no invitation behind when it carried the only link", async () => {
		const { DANA } = await import("../test/api.ts");
		const sent = await as(DANA).post("/v1/admin/invites/email", {
			email: "friend@down.example",
		});
		expect(sent.status).toBe(502);
		const open = await env.DB.prepare(
			"SELECT count(*) AS n FROM invites WHERE sent_to = 'friend@down.example' AND revoked_at IS NULL",
		).first<{ n: number }>();
		expect(open?.n).toBe(0);
	});
});

describe("a browser that keeps refusing pushes", () => {
	const failures = async (endpoint: string) =>
		(
			await env.DB.prepare(
				"SELECT failures FROM push_subscriptions WHERE endpoint = ?",
			)
				.bind(endpoint)
				.first<{ failures: number }>()
		)?.failures;

	it("is left out after five refusals in a row, and the email goes at once", async () => {
		const { PUSH_REFUSALS, tell } = await import("./notify.ts");
		const endpoint = "https://fcm.googleapis.com/fcm/send/refusing";
		await subscribe(DANA, endpoint);
		const dana = await env.DB.prepare("SELECT email FROM members WHERE id = ?")
			.bind(DANA)
			.first<{ email: string }>();
		const message = {
			kind: "push_test",
			to: dana!.email,
			locale: "en",
			url: "http://app.test/settings",
		} as const;
		for (let n = 1; n <= PUSH_REFUSALS; n++) {
			await tell(env, message);
			expect(await failures(endpoint)).toBe(n);
		}
		// Left out now: not tried, so not counted, and nothing waits on it.
		await tell(env, message);
		expect(await failures(endpoint)).toBe(PUSH_REFUSALS);
		expect((await pending()).results).toHaveLength(0);
	});

	it("is forgiven its count once a push gets through", async () => {
		const { tell } = await import("./notify.ts");
		const endpoint = "https://fcm.googleapis.com/fcm/send/dana-again";
		await subscribe(DANA, endpoint);
		await env.DB.prepare(
			"UPDATE push_subscriptions SET failures = 3 WHERE endpoint = ?",
		)
			.bind(endpoint)
			.run();
		const dana = await env.DB.prepare("SELECT email FROM members WHERE id = ?")
			.bind(DANA)
			.first<{ email: string }>();
		await tell(env, {
			kind: "push_test",
			to: dana!.email,
			locale: "en",
			url: "http://app.test/settings",
		});
		expect(await failures(endpoint)).toBe(0);
	});
});
