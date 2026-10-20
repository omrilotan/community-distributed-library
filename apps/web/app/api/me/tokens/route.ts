import { core } from "../../../../lib/core.ts";
import type { TokenCreated } from "@cdl/contracts";
import { fromAForm, seeOther } from "../../../../lib/shown-once-cookie.ts";

/**
 * Mint a personal token for the signed-in member; the token is returned
 * once: as JSON to the page's script, or, to a browser posting the form
 * itself, on the page it is sent back to (lib/shown-once.ts).
 */
export async function POST(request: Request): Promise<Response> {
	const form = fromAForm(request);
	const body = form
		? await request.formData().then((data) =>
				JSON.stringify({
					clientName: String(data.get("name") ?? ""),
					scopes: data.getAll("scopes").map(String),
				}),
			)
		: await request.text();
	const { status, body: created } = await core<TokenCreated>("/v1/me/tokens", {
		method: "POST",
		body,
	});
	if (!form) return Response.json(created, { status });
	if (status === 401) return seeOther("/login");
	if (status !== 201) return seeOther("/connect?token=failed#tokens");
	return seeOther("/connect#tokens", { kind: "token", secret: created.token });
}
