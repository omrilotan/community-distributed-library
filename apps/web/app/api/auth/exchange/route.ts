import type { Session } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import { sessionCookie } from "../../../../lib/session.ts";

/**
 * The sign-in page's button posts the link's token here, and only here does
 * it become a session: mail scanners open links, but they do not submit forms.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const token = String(form.get("token") ?? "");
	const { status, body } = await core<Session>("/v1/auth/exchange", {
		method: "POST",
		token: null,
		body: JSON.stringify({ token }),
	});
	if (status !== 200) {
		return new Response(null, {
			status: 303,
			headers: { location: "/login?error=1" },
		});
	}

	return new Response(null, {
		status: 303,
		headers: {
			// A new member gets the explanation first; everyone else, the books.
			location: body.isNew ? "/start" : "/",
			"set-cookie": sessionCookie(body.token, body.expiresAt),
		},
	});
}
