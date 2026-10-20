import { Hono } from "hono";
import { ApproveClient, CreateToken, problem } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewer } from "./auth.ts";
import { moderator } from "./auth.ts";
import { json } from "./problem.ts";
import {
	listTokens,
	mintToken,
	mintTokenWithConsent,
	revokeToken,
} from "./tokens-store.ts";

/**
 * Consent and token management. Only a session (a person in a browser) may
 * approve a client or revoke a token — never an access token, so a leaked
 * token cannot mint more of itself.
 */
export const tokens = new Hono<{ Bindings: Env }>();

tokens.post("/v1/oauth/approve", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));

	const parsed = ApproveClient.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid consent"));
	const { clientName, scopes } = parsed.data;
	if (scopes.includes("admin") && !(await moderator(c))) {
		return json(
			c,
			problem(403, "Moderators only", "admin scope needs a moderator"),
		);
	}
	const consent = await mintTokenWithConsent(
		c.env,
		member.id,
		clientName,
		scopes,
	);
	return c.json(consent, 201);
});

tokens.get("/v1/me/tokens", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	return c.json({ tokens: await listTokens(c.env, member.id) });
});

/** A personal token for scripts, minted from the connect page. Sessions only. */
tokens.post("/v1/me/tokens", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const parsed = CreateToken.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid token request"));
	const { clientName, scopes } = parsed.data;
	if (scopes.includes("admin") && !(await moderator(c))) {
		return json(
			c,
			problem(403, "Moderators only", "admin scope needs a moderator"),
		);
	}
	return c.json(await mintToken(c.env, member.id, clientName, scopes), 201);
});

tokens.delete("/v1/me/tokens/:id", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const ok = await revokeToken(c.env, member.id, c.req.param("id"));
	return ok ? c.body(null, 204) : json(c, problem(404, "No such token"));
});
