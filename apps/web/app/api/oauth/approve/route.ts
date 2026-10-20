import { env } from "cloudflare:workers";
import type { ConsentCode } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import { pendingConsent } from "../../../../lib/consent.ts";

/** Approve → core mints a scoped token + one-time code → back to the MCP server to finish. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const req = String(form.get("req") ?? "");
	// The client's name comes from the MCP server's record of the request, and
	// only scopes it asked for can be granted.
	const pending = await pendingConsent(req);
	if (!pending)
		return redirect(`/oauth/consent?req=${encodeURIComponent(req)}`);
	const client = pending.clientName;
	const scopes = form
		.getAll("scope")
		.map(String)
		.filter((scope) => (pending.scopes as string[]).includes(scope));

	const { status, body } = await core<ConsentCode>("/v1/oauth/approve", {
		method: "POST",
		body: JSON.stringify({ clientName: client, scopes }),
	});
	if (status === 401) return redirect("/login");
	if (status !== 201) {
		return redirect(`/oauth/consent?req=${encodeURIComponent(req)}&error=1`);
	}
	// Where the code goes is ours to know, never the form's: a code sent
	// anywhere else could be redeemed for somebody else's client.
	const mcp =
		process.env.NODE_ENV !== "production"
			? "http://localhost:8788"
			: ((env as unknown as { MCP_URL?: string }).MCP_URL ?? "");
	const target = new URL("/oauth/complete", mcp);
	target.searchParams.set("req", req);
	target.searchParams.set("code", body.code);
	return redirect(target.href);
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
