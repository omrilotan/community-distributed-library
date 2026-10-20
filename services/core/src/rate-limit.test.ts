import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api } from "../test/api.ts";
import { callerIp, network } from "./rate-limit.ts";

const link = (email: string) =>
	api(null, "POST", "/v1/auth/magic-link", { email });

describe("sign-in links are rationed", () => {
	it("allows three to an address, then says when to come back", async () => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			expect((await link("someone@example.com")).status).toBe(200);
		}
		const refused = await link("someone@example.com");
		expect(refused.status).toBe(429);
		expect(refused.body).toMatchObject({
			title: "Too many sign-in links",
			status: 429,
		});
		// The wait is in the body, so the page can put a number in front of a person.
		expect(refused.body.retryAfter).toBeGreaterThan(0);
		expect(refused.body.retryAfter).toBeLessThanOrEqual(15 * 60);
	});

	it("counts each address on its own", async () => {
		for (let attempt = 0; attempt < 4; attempt += 1) {
			await link("noisy@example.com");
		}
		expect((await link("quiet@example.com")).status).toBe(200);
	});

	it("says nothing about whether the address is a member", async () => {
		// Same shape for a member and a stranger, refusal included.
		const stranger = await link("nobody@example.com");
		const member = await link("dana@example.com");
		expect(stranger.status).toBe(member.status);
	});

	it("cannot be used up for an address from somewhere else, and stops for the day", async () => {
		const from = (ip: string) =>
			SELF.fetch("http://core.test/v1/auth/magic-link", {
				method: "POST",
				headers: { "content-type": "application/json", "x-cdl-client-ip": ip },
				body: JSON.stringify({ email: "target@example.com" }),
			}).then((response) => response.status);
		// Someone elsewhere uses up their own fifteen minutes...
		for (let attempt = 0; attempt < 3; attempt += 1)
			expect(await from("192.0.2.66")).toBe(200);
		expect(await from("192.0.2.66")).toBe(429);
		// ...and the address's owner still gets theirs.
		expect(await from("198.51.100.7")).toBe(200);
		// From many places, twenty a day is all an address gets.
		let last = 200;
		for (let place = 1; place <= 20; place += 1)
			last = await from(`203.0.113.${place}`);
		expect(last).toBe(429);
	});

	it("counts an IPv6 caller by its /64", () => {
		expect(network("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
		expect(network("2001:0db8:0001:0002:ffff:0:0:2")).toBe("2001:db8:1:2::/64");
		expect(network("2001:db8::1")).toBe("2001:db8:0:0::/64");
		expect(network("::ffff:192.0.2.1")).toBe("192.0.2.1");
		expect(network("192.0.2.1")).toBe("192.0.2.1");
	});

	it("limits token guesses too", async () => {
		let last = 200;
		for (let attempt = 0; attempt < 21; attempt += 1) {
			last = (await api(null, "POST", "/v1/auth/exchange", { token: "nope" }))
				.status;
		}
		expect(last).toBe(429);
	});
});

describe("backups", () => {
	it("writes a replayable snapshot and is moderators only", async () => {
		const { env } = await import("cloudflare:test");
		const { as, COPY_B, DANA, SAM } = await import("../test/api.ts");
		expect((await as(SAM).post("/v1/admin/backup")).status).toBe(403);
		// Text the parser chokes on, and a line break, must come back whole.
		const note = "by the gate\u0000 — ring\ntwice, it's fine";
		await env.DB.prepare("UPDATE copies SET note = ? WHERE id = ?")
			.bind(note, COPY_B)
			.run();
		try {
			const taken = await as(DANA).post("/v1/admin/backup");
			expect(taken.status).toBe(201);
			const sql = await (await env.BACKUPS!.get(taken.body.key))!.text();

			// Something changes after the snapshot; replaying it puts it back.
			await env.DB.batch([
				env.DB.prepare(
					"UPDATE members SET display_name = 'Changed' WHERE id = ?",
				).bind(SAM),
				env.DB.prepare("UPDATE copies SET note = NULL WHERE id = ?").bind(
					COPY_B,
				),
			]);
			const statements = sql
				.split("\n")
				.filter((line) => line.startsWith("INSERT"));
			await env.DB.batch(statements.map((line) => env.DB.prepare(line)));
			expect((await as(SAM).get("/v1/me")).body.displayName).toBe("Sam");
			const restored = await env.DB.prepare(
				"SELECT note FROM copies WHERE id = ?",
			)
				.bind(COPY_B)
				.first<{ note: string }>();
			expect(restored?.note).toBe(note);
		} finally {
			await env.DB.prepare("UPDATE copies SET note = NULL WHERE id = ?")
				.bind(COPY_B)
				.run();
		}
	});
});

describe("figures a member keeps to themselves", () => {
	it("counts loans that started, not requests that were withdrawn", async () => {
		const { as, activeLoan, COPY_B, DANA, NOA, SAM } =
			await import("../test/api.ts");
		const before = await as(DANA).get(`/v1/copies/${COPY_B}`);
		expect(before.body.stats).toMatchObject({ loans: 0, readers: 0 });

		// A request nobody went through with leaves no trace in the figures.
		const withdrawn = await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await as(SAM).post(`/v1/loans/${withdrawn.body.id}/cancel`);
		expect((await as(DANA).get(`/v1/copies/${COPY_B}`)).body.stats.loans).toBe(
			0,
		);

		// Two readings, by two different neighbours.
		const first = await activeLoan(SAM, DANA, COPY_B);
		await as(DANA).post(`/v1/loans/${first}/returned`);
		await activeLoan(NOA, DANA, COPY_B);

		const stats = (await as(DANA).get(`/v1/copies/${COPY_B}`)).body.stats;
		expect(stats).toMatchObject({ loans: 2, readers: 2 });
		expect(stats.lastLoanAt).toBeGreaterThan(0);

		const mine = await as(DANA).get("/v1/me/stats");
		expect(mine.body).toMatchObject({
			lent: 2,
			readers: 2,
			outNow: 1,
			books: 2,
		});
		expect((await as(SAM).get("/v1/me/stats")).body).toMatchObject({
			borrowed: 1,
			lent: 0,
		});
	});

	it("is nobody else's business", async () => {
		const { as, COPY_B, SAM } = await import("../test/api.ts");
		// The copy route is owner-only, so a neighbour cannot read its figures.
		expect((await as(SAM).get(`/v1/copies/${COPY_B}`)).status).toBe(404);
	});
});

describe("whose address a limit counts", () => {
	it("is the visitor's, as the web worker passes it on", () => {
		const request = new Request("http://core/", {
			headers: {
				"x-cdl-client-ip": "203.0.113.7",
				"x-forwarded-for": "1.2.3.4",
			},
		});
		expect(callerIp(request)).toBe("203.0.113.7");
	});

	it("never takes a forwarded-for header a caller could write", () => {
		const request = new Request("http://core/", {
			headers: { "x-forwarded-for": "1.2.3.4" },
		});
		expect(callerIp(request)).toBe("unknown");
	});
});
