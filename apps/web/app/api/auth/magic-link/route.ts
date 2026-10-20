import type { MagicLinkResponse, Problem } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";

export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const invite = String(form.get("invite") ?? "");
	const { status, body } = await core<MagicLinkResponse & Problem>(
		"/v1/auth/magic-link",
		{
			method: "POST",
			token: null,
			body: JSON.stringify({
				email: String(form.get("email") ?? ""),
				locale: String(form.get("locale") ?? "en"),
				...(invite ? { invite } : {}),
			}),
		},
	);

	// Development: no email channel yet, so jump straight to the link.
	if (status === 200 && body.debugUrl) {
		return new Response(null, {
			status: 303,
			headers: { location: body.debugUrl },
		});
	}
	const location =
		status === 200
			? body.debugReason
				? `/login?sent=1&dev=${body.debugReason}`
				: "/login?sent=1"
			: status === 429
				? `/login?error=rate&wait=${body.retryAfter ?? 900}`
				: "/login?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
