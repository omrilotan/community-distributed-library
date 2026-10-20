import { core } from "../../lib/core.ts";
import { clearedSessionCookie } from "../../lib/session.ts";

export async function POST(): Promise<Response> {
	await core("/v1/auth/logout", { method: "POST" }).catch(() => null);
	return new Response(null, {
		status: 303,
		headers: { location: "/login", "set-cookie": clearedSessionCookie() },
	});
}
