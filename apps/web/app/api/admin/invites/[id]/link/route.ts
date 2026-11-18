import type { Invite } from "@cdl/contracts";
import { core } from "../../../../../../lib/core.ts";
import { shownOnceCookie } from "../../../../../../lib/shown-once-cookie.ts";

/**
 * The link of an invite this moderator made, again, with what its sign
 * needs: when it opens and closes. Shown on the next view of the invites
 * page, never in an address (lib/shown-once.ts).
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
			headers: { location: "/admin/invites?error=gone" },
		});
	return new Response(null, {
		status: 303,
		headers: {
			location: "/admin/invites",
			"set-cookie": shownOnceCookie({
				kind: "batch-invite",
				url: body.url,
				expiresAt: body.expiresAt,
				startsAt: body.startsAt ?? null,
				maxUses: body.maxUses,
				showable: true,
			}),
		},
	});
}
