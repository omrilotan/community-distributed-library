import type { Invite } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import {
	fromAForm,
	shownOnceCookie,
} from "../../../../lib/shown-once-cookie.ts";

/**
 * One invite, for one neighbour. The link comes back once: as JSON to the
 * page's script, or, to a browser posting the form itself, on the profile
 * it is sent back to (lib/shown-once.ts).
 */
export async function POST(request: Request): Promise<Response> {
	const { status, body } = await core<Invite>("/v1/invites", {
		method: "POST",
		body: "{}",
	});
	if (!fromAForm(request)) return Response.json(body, { status });
	if (status === 401)
		return new Response(null, { status: 303, headers: { location: "/login" } });
	if (status !== 201)
		return new Response(null, {
			status: 303,
			headers: {
				location: `/settings?invite=${status === 409 ? "many" : "failed"}#invite`,
			},
		});
	return new Response(null, {
		status: 303,
		headers: {
			location: "/settings#invite",
			"set-cookie": shownOnceCookie({
				kind: "invite",
				url: body.url,
				expiresAt: body.expiresAt,
			}),
		},
	});
}
