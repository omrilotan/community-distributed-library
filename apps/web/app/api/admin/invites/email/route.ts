import { core } from "../../../../../lib/core.ts";

/** A moderator inviting one person by email: core sends the link itself. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const { status } = await core("/v1/admin/invites/email", {
		method: "POST",
		body: JSON.stringify({ email: String(form.get("email") ?? "").trim() }),
	});
	if (status === 401) return redirect("/login");
	// The address stays out of the URL; the list below shows who it went to.
	return redirect(
		status === 201
			? "/admin/invites?sent=1"
			: status === 409
				? "/admin/invites?error=member"
				: status === 429
					? "/admin/invites?error=rate"
					: "/admin/invites?error=1",
	);
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
