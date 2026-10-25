import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { SCOPES } from "@cdl/contracts";
import type { Env, Props } from "./env.ts";
import { consentHandler } from "./consent.ts";
import { libraryInfo } from "./library.ts";
import { createServer } from "./tools.ts";

/** Behind the OAuth gate: every request here carries a grant's props. */
const mcpHandler = {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const props = (ctx as ExecutionContext & { props: Props }).props;
		const library = await libraryInfo(env);
		// Core no longer takes this connection's token: the grant goes too, so
		// the client's next request is told to connect again, rather than the
		// assistant staying "connected" with every tool failing.
		const bearer = request.headers
			.get("authorization")
			?.match(/^Bearer\s+(.+)$/i)?.[1];
		const onRevoked = async () => {
			const token = bearer
				? await env.OAUTH_PROVIDER.unwrapToken(bearer).catch(() => null)
				: null;
			if (token)
				await env.OAUTH_PROVIDER.revokeGrant(token.grantId, token.userId).catch(
					(error: unknown) => console.error("[mcp] grant not revoked", error),
				);
		};
		return createMcpHandler(() => createServer(env, props, library, onRevoked))(
			request,
			env,
			ctx,
		);
	},
};

/**
 * One provider per isolate. Every token is bound to one resource, this
 * Worker's own /mcp: the address MCP clients connect to, and exactly what
 * the grants made before 1.x carry, so nobody is signed out by it.
 * Registrations made by clients expire after 90 days unused (the library's
 * default), so abandoned ones do not pile up.
 */
let provider: OAuthProvider | undefined;
function oauth(env: Env): OAuthProvider {
	provider ??= new OAuthProvider({
		apiRoute: "/mcp",
		apiHandler: mcpHandler,
		defaultHandler: consentHandler as {
			fetch(
				request: Request,
				env: Env,
				ctx: ExecutionContext,
			): Promise<Response>;
		},
		authorizeEndpoint: "/authorize",
		tokenEndpoint: "/token",
		clientRegistrationEndpoint: "/register",
		scopesSupported: [...SCOPES],
		resourceMetadata: { resource: `${env.SELF_URL}/mcp` },
	});
	return provider;
}

/**
 * Only on the custom domain: a workers.dev address is off in the config, and
 * refused here too, in case it is ever switched back on.
 */
export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);
		if (url.hostname.endsWith(".workers.dev")) {
			return new Response("Not found", { status: 404 });
		}
		// A client looking for this origin's icon gets the library's.
		if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") {
			const icon = url.pathname.endsWith(".ico") ? "favicon.ico" : "icon.svg";
			return Response.redirect(`${env.APP_URL}/${icon}`, 302);
		}
		// Registering asks nothing of the caller and writes to storage, so it is
		// rationed per address: plenty for an assistant, nothing to flood with.
		if (url.pathname === "/register" && request.method === "POST") {
			const caller = request.headers.get("cf-connecting-ip") ?? "unknown";
			const { success } = await env.REGISTER_LIMIT.limit({ key: caller });
			if (!success)
				return Response.json(
					{
						error: "temporarily_unavailable",
						error_description: "Too many registrations. Try again in a minute.",
					},
					{ status: 429, headers: { "retry-after": "60" } },
				);
		}
		return oauth(env).fetch(request, env, ctx);
	},
};
