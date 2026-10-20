import { Hono } from "hono";
import { problem } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewer } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { countPushes } from "./notify.ts";
import { json } from "./problem.ts";
import { take } from "./rate-limit.ts";

export const push = new Hono<{ Bindings: Env }>();

/**
 * The browsers' own push services. Notify POSTs to whatever endpoint is
 * stored, so only theirs are accepted: not a member's server, not ours.
 */
const PUSH_HOSTS = [
	/^fcm\.googleapis\.com$/,
	/^jmt\d+\.google\.com$/,
	/^updates\.push\.services\.mozilla\.com$/,
	/^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
	/^(?:[a-z0-9-]+\.)*notify\.windows\.com$/,
];

function pushService(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		return (
			url.protocol === "https:" &&
			PUSH_HOSTS.some((host) => host.test(url.hostname))
		);
	} catch {
		return false;
	}
}

/** Public: the browser needs this to subscribe at all. */
push.get("/v1/push/key", (c) =>
	c.json({ publicKey: c.env.VAPID_PUBLIC_KEY ?? null }),
);

/** One row per browser. The same person on a phone and a laptop has two. */
push.put("/v1/me/push", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const body = (await c.req.json().catch(() => null)) as {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
	} | null;
	const endpoint = body?.endpoint;
	const p256dh = body?.keys?.p256dh;
	const auth = body?.keys?.auth;
	if (!endpoint || !p256dh || !auth || !pushService(endpoint)) {
		return json(c, problem(422, "Invalid subscription"));
	}

	// Kept with the sign-in it was made in: signing out there ends it.
	await c.env.DB.prepare(
		`INSERT INTO push_subscriptions (id, member_id, endpoint, p256dh, auth, created_at, session_id)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
		 ON CONFLICT (endpoint) DO UPDATE SET
		   member_id = ?2, p256dh = ?4, auth = ?5, failures = 0, session_id = ?7`,
	)
		.bind(ulid(), member.id, endpoint, p256dh, auth, now(), member.sessionId)
		.run();
	return c.body(null, 204);
});

/**
 * Push a test to this one device: the member presses a button and sees
 * whether a notification arrives. Never falls back to email.
 */
push.post("/v1/me/push/test", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const body = (await c.req.json().catch(() => null)) as {
		endpoint?: string;
	} | null;
	if (!body?.endpoint) return json(c, problem(422, "Which subscription?"));

	const limit = await take(c.env, {
		bucket: "push_test:member",
		subject: member.id,
		allow: 5,
		per: 60 * 60,
	});
	if (!limit.ok) return json(c, problem(429, "Five tests an hour"));

	const row = await c.env.DB.prepare(
		`SELECT s.id, s.endpoint, s.p256dh, s.auth, m.email, m.locale
		   FROM push_subscriptions s JOIN members m ON m.id = s.member_id
		  WHERE s.endpoint = ? AND s.member_id = ?`,
	)
		.bind(body.endpoint, member.id)
		.first<{
			id: string;
			endpoint: string;
			p256dh: string;
			auth: string;
			email: string;
			locale: "en" | "he";
		}>();
	// The browser thinks it is subscribed; the library does not know it.
	if (!row) return c.json({ sent: 0, known: false });

	const outcome = await c.env.NOTIFY.push(
		[
			{
				id: row.id,
				endpoint: row.endpoint,
				p256dh: row.p256dh,
				auth: row.auth,
			},
		],
		{
			kind: "push_test",
			to: row.email,
			locale: row.locale,
			url: `${c.env.APP_URL}/settings`,
		},
	);
	await countPushes(c.env, outcome);
	return c.json({ sent: outcome.sent, known: true });
});

push.delete("/v1/me/push", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	// A DELETE body is awkward for some clients, so the query string works too.
	const body = (await c.req.json().catch(() => null)) as {
		endpoint?: string;
	} | null;
	const endpoint = c.req.query("endpoint") ?? body?.endpoint;
	if (!endpoint) return json(c, problem(422, "Which subscription?"));
	await c.env.DB.prepare(
		"DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?",
	)
		.bind(endpoint, member.id)
		.run();
	return c.body(null, 204);
});
