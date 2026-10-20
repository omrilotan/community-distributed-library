import { core } from "../../../../lib/core.ts";
import { qrFor } from "../../../../lib/qr.ts";
import { fromAForm, seeOther } from "../../../../lib/shown-once-cookie.ts";

/**
 * A one-time sign-in link for the member's other device, and the same link
 * as a QR code to scan. Never in an address, where a history would keep it:
 * JSON to the page's script or, to a browser posting the form itself, a
 * cookie for the one page view that shows it (lib/shown-once.ts).
 */
export async function POST(request: Request): Promise<Response> {
	const { status, body } = await core<{ url: string; expiresAt: number }>(
		"/v1/me/device-link",
		{ method: "POST", body: "{}" },
	);
	if (fromAForm(request)) {
		if (status === 401) return seeOther("/login");
		if (status !== 201)
			return seeOther(`/device?error=${status === 429 ? "many" : "failed"}`);
		return seeOther("/device", {
			kind: "device-link",
			url: body.url,
			expiresAt: body.expiresAt,
		});
	}
	if (status !== 201) {
		return Response.json(
			{ ok: false, status },
			{ status: status === 401 ? 401 : status === 429 ? 429 : 400 },
		);
	}
	return Response.json(
		{ ok: true, url: body.url, expiresAt: body.expiresAt, qr: qrFor(body.url) },
		{ headers: { "cache-control": "no-store" } },
	);
}
