import type { MagicLinkResponse, Problem } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import { backAfterSignIn } from "../../../../lib/safe-path.ts";
import {
	newSignInBrowser,
	signInBrowser,
	signInCookies,
} from "../../../../lib/sign-in.ts";

export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const invite = String(form.get("invite") ?? "");
	// Kept across asks, so every code this browser was sent still works here.
	const browser = (await signInBrowser()) ?? newSignInBrowser();
	const back = backAfterSignIn(form.get("back"));
	const { status, body } = await core<MagicLinkResponse & Problem>(
		"/v1/auth/magic-link",
		{
			method: "POST",
			token: null,
			body: JSON.stringify({
				email: String(form.get("email") ?? ""),
				locale: String(form.get("locale") ?? "en"),
				browser,
				...(invite ? { invite } : {}),
			}),
		},
	);

	const headers = new Headers();
	for (const cookie of signInCookies(browser, back))
		headers.append("set-cookie", cookie);

	// Development: no email channel yet, so jump straight to the link.
	if (status === 200 && body.debugUrl) {
		headers.set("location", body.debugUrl);
		return new Response(null, { status: 303, headers });
	}
	headers.set(
		"location",
		status === 200
			? body.debugReason
				? `/login?sent=1&dev=${body.debugReason}`
				: "/login?sent=1"
			: status === 429
				? `/login?error=rate&wait=${body.retryAfter ?? 900}`
				: "/login?error=1",
	);
	return new Response(null, { status: 303, headers });
}
