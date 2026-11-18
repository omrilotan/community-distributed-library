import type { Invite } from "@cdl/contracts";
import { dayBounds } from "../../../../lib/calendar.ts";
import { core } from "../../../../lib/core.ts";
import { shownOnceCookie } from "../../../../lib/shown-once-cookie.ts";

/**
 * A moderator's link: for some days from now, or for one day, an event's,
 * midnight to midnight in the library's time zone. The form posts without a
 * script, so the day is turned into times here, not in the browser.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const maxUses = Number(form.get("maxUses") ?? 1);
	const day = String(form.get("date") ?? "");
	let window: { startsAt: number; expiresAt: number } | null = null;
	if (form.get("mode") === "date") {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
			return redirect("/admin/invites?error=date");
		const { start, end } = dayBounds(day);
		window = {
			startsAt: Math.floor(start.getTime() / 1000),
			expiresAt: Math.floor(end.getTime() / 1000),
		};
	}
	const { status, body } = await core<Invite>("/v1/admin/invites", {
		method: "POST",
		body: JSON.stringify(
			window
				? { maxUses, ...window }
				: { maxUses, days: Number(form.get("days") ?? 7) },
		),
	});
	if (status === 401) return redirect("/login");
	if (status !== 201)
		return redirect(`/admin/invites?error=${window ? "date" : "1"}`);
	// The URL never travels in an address: the next page view gets it
	// (lib/shown-once.ts). The database holds its hash, and a sealed copy
	// where the library keeps links for their maker to see again.
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
				showable: body.showable,
			}),
		},
	});
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
