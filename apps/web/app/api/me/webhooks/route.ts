import { core } from "../../../../lib/core.ts";
import type { WebhookCreated } from "@cdl/contracts";
import { fromAForm, seeOther } from "../../../../lib/shown-once-cookie.ts";

/**
 * Subscribe; the signing secret comes back once, as JSON to the page's
 * script or, to a browser posting the form itself, on the page it is sent
 * back to (lib/shown-once.ts).
 */
export async function POST(request: Request): Promise<Response> {
	const form = fromAForm(request);
	const body = form
		? await request.formData().then((data) =>
				JSON.stringify({
					url: String(data.get("url") ?? ""),
					kinds: data.getAll("kinds").map(String),
				}),
			)
		: await request.text();
	const { status, body: created } = await core<WebhookCreated>(
		"/v1/me/webhooks",
		{ method: "POST", body },
	);
	if (!form) return Response.json(created, { status });
	if (status === 401) return seeOther("/login");
	if (status !== 201) return seeOther("/connect?webhook=refused#webhooks");
	return seeOther("/connect#webhooks", {
		kind: "webhook-secret",
		secret: created.secret,
	});
}
