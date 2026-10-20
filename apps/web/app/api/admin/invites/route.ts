import type { Invite } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import { shownOnceCookie } from "../../../../lib/shown-once-cookie.ts";

export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const { status, body } = await core<Invite>("/v1/admin/invites", {
		method: "POST",
		body: JSON.stringify({
			maxUses: Number(form.get("maxUses") ?? 1),
			days: Number(form.get("days") ?? 7),
		}),
	});
	if (status === 401) return redirect("/login");
	if (status !== 201) return redirect("/admin/invites?error=1");
	// The URL is shown once, only its hash lives in the database, and it never
	// travels in an address: the next page view gets it (lib/shown-once.ts).
	return new Response(null, {
		status: 303,
		headers: {
			location: "/admin/invites",
			"set-cookie": shownOnceCookie({
				kind: "batch-invite",
				url: body.url,
				expiresAt: body.expiresAt,
			}),
		},
	});
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
