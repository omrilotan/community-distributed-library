import type { Session } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import {
	signInBack,
	signInBrowser,
	signedIn,
} from "../../../../lib/sign-in.ts";

/**
 * The email's code, typed on the page that asked for the link. Core holds
 * it to this browser's own value, so a code read off someone else's email
 * signs in nothing here, and a code typed anywhere else signs in nothing.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	// "1234 5678", "1234-5678": only the digits count.
	const code = String(form.get("code") ?? "").replace(/\D/g, "");
	const browser = await signInBrowser();
	if (!browser || code.length !== 8) return again("code");

	const { status, body } = await core<Session>("/v1/auth/code", {
		method: "POST",
		token: null,
		body: JSON.stringify({ browser, code }),
	});
	if (status === 200) return signedIn(body, await signInBack());
	return again("code");
}

/** Back to the page with the code's field, saying what went wrong. */
function again(error: string): Response {
	return new Response(null, {
		status: 303,
		headers: { location: `/login?sent=1&error=${error}` },
	});
}
