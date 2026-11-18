import type { Invite } from "@cdl/contracts";
import { core } from "../../../../../../lib/core.ts";
import { shownOnceCookie } from "../../../../../../lib/shown-once-cookie.ts";

/**
 * The link of an invite I made, again. It comes back the way a new one
 * does: on the next view of my account, never in an address
 * (lib/shown-once.ts).
 */
export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const { status, body } = await core<Invite>(
		`/v1/me/invites/${encodeURIComponent(id)}/link`,
		{ method: "POST" },
	);
	if (status === 401)
		return new Response(null, { status: 303, headers: { location: "/login" } });
	if (status !== 200)
		return new Response(null, {
			status: 303,
			headers: { location: "/settings?invite=gone#invite" },
		});
	return new Response(null, {
		status: 303,
		headers: {
			location: "/settings#invite",
			"set-cookie": shownOnceCookie({
				kind: "invite",
				url: body.url,
				expiresAt: body.expiresAt,
				showable: true,
			}),
		},
	});
}
