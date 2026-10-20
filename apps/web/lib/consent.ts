import { env } from "cloudflare:workers";
import { Scope } from "@cdl/contracts";

/** An OAuth request waiting for the member's answer, as the MCP server holds it. */
export interface PendingConsent {
	clientName: string;
	/** Where the client's code goes if the member says yes. */
	redirectHost: string;
	scopes: Scope[];
}

/**
 * Asked of the MCP server over the binding, never taken from the URL, so the
 * screen shows the client that registered and not a name somebody typed.
 */
export async function pendingConsent(
	req: string | undefined | null,
): Promise<PendingConsent | null> {
	if (!req) return null;
	const mcp = (env as unknown as { MCP: Fetcher }).MCP;
	const response = await mcp
		.fetch(`https://mcp/oauth/request?req=${encodeURIComponent(req)}`)
		.catch(() => null);
	if (!response?.ok) return null;
	const body = (await response.json()) as {
		clientName: string;
		redirectHost: string;
		scopes: string[];
	};
	return {
		clientName: body.clientName,
		redirectHost: body.redirectHost,
		scopes: body.scopes.filter(
			(value): value is Scope => Scope.safeParse(value).success,
		),
	};
}
