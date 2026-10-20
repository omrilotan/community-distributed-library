import { Hono } from "hono";
import { problem } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewer } from "./auth.ts";
import { json } from "./problem.ts";
import { take } from "./rate-limit.ts";
import { placeAt, suggestPlaces } from "./places.ts";

/** Naming where a member lives: suggestions as they type, and a name for a point. */
export const places = new Hono<{ Bindings: Env }>();

/** The library's centre, which suggestions are ranked by distance from. */
export async function communityCentre(env: Env, communityId: string) {
	const row = await env.DB.prepare(
		"SELECT centre_lat, centre_lng FROM communities WHERE id = ?",
	)
		.bind(communityId)
		.first<{ centre_lat: number; centre_lng: number }>();
	return row ? { lat: row.centre_lat, lng: row.centre_lng } : null;
}

async function allowed(c: { env: Env }, memberId: string) {
	// A lookup per keystroke, give or take: generous, but not unlimited.
	return (
		await take(c.env, {
			bucket: "places:member",
			subject: memberId,
			allow: 300,
			per: 60 * 60,
		})
	).ok;
}

places.get("/v1/places", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!(await allowed(c, member.id)))
		return json(c, problem(429, "Too many lookups"));
	const centre = await communityCentre(c.env, member.communityId);
	if (!centre) return c.json({ places: [] });
	return c.json({
		places: await suggestPlaces(
			c.env,
			c.executionCtx,
			centre,
			c.req.query("q") ?? "",
		),
	});
});

places.get("/v1/places/at", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	const lat = Number(c.req.query("lat"));
	const lng = Number(c.req.query("lng"));
	if (!Number.isFinite(lat) || !Number.isFinite(lng))
		return json(c, problem(422, "Which point?"));
	if (!(await allowed(c, member.id)))
		return json(c, problem(429, "Too many lookups"));
	return c.json({ name: await placeAt(c.env, c.executionCtx, { lat, lng }) });
});
