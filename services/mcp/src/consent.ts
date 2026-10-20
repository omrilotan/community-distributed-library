import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env } from "./env.ts";
import { libraryName } from "./library.ts";

/**
 * The non-API side of the OAuth server: the consent handshake. The screen
 * itself lives in the web app, where the member's session is; this worker
 * only starts the dance and finishes it.
 *
 *   client → /authorize → web /oauth/consent → (approve) → /oauth/complete → client
 *
 * The authorization request never travels in a URL. It waits here, in KV,
 * under a random id, so the consent screen can only show what the client
 * actually registered (its name, and the host the code will go to) and the
 * finish can only complete a request this server started.
 */
const PENDING_TTL = 15 * 60;

interface Pending {
	auth: AuthRequest;
	clientName: string;
	redirectHost: string;
}
export const consentHandler: ExportedHandler<Env> = {
	async fetch(request, env) {
		const url = new URL(request.url);

		// Nothing on this host is for an index, any more than the library is.
		if (url.pathname === "/robots.txt") {
			return new Response(
				"User-agent: *\nAllow: /.well-known/\nDisallow: /\n",
				{
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"cache-control": "public, max-age=86400",
					},
				},
			);
		}

		if (url.pathname === "/authorize") {
			let auth: AuthRequest;
			try {
				auth = await env.OAUTH_PROVIDER.parseAuthRequest(request);
			} catch (error) {
				return new Response(`Bad authorization request: ${String(error)}`, {
					status: 400,
				});
			}
			const client = await env.OAUTH_PROVIDER.lookupClient(auth.clientId);
			const id = crypto.randomUUID();
			const pending: Pending = {
				auth,
				// As core will keep it (trimmed, at most 80): the name the consent
				// is given under must match the one it is checked against.
				clientName:
					(client?.clientName ?? auth.clientId).trim().slice(0, 80) ||
					"An assistant",
				redirectHost: new URL(auth.redirectUri).host,
			};
			await env.OAUTH_KV.put(key(id), JSON.stringify(pending), {
				expirationTtl: PENDING_TTL,
			});
			const target = new URL("/oauth/consent", env.APP_URL);
			target.searchParams.set("req", id);
			return Response.redirect(target.href, 302);
		}

		// What the consent screen shows, read by the web worker over its binding.
		if (url.pathname === "/oauth/request") {
			const pending = await load(env, url.searchParams.get("req"));
			if (!pending) return new Response("Not found", { status: 404 });
			return Response.json({
				clientName: pending.clientName,
				redirectHost: pending.redirectHost,
				scopes: pending.auth.scope,
			});
		}

		if (url.pathname === "/oauth/complete") {
			const id = url.searchParams.get("req");
			const pending = await load(env, id);
			const code = url.searchParams.get("code") ?? "";
			if (!pending || !code)
				return new Response("Consent expired. Start again from your client.", {
					status: 410,
				});

			const grant = await env.CORE_INTERNAL.redeemConsent(code);
			if (!grant)
				return new Response("Consent expired. Start again from your client.", {
					status: 410,
				});
			// The code must have been given for this request: the same client, and
			// no scope the client did not ask for.
			if (
				grant.clientName !== pending.clientName ||
				!grant.scopes.every((scope) => pending.auth.scope.includes(scope))
			) {
				return new Response("Consent does not match the request.", {
					status: 400,
				});
			}
			await env.OAUTH_KV.delete(key(id as string));
			const auth = pending.auth;

			const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
				request: auth,
				userId: grant.memberId,
				metadata: { clientName: grant.clientName },
				scope: grant.scopes,
				props: {
					memberId: grant.memberId,
					scopes: grant.scopes,
					coreToken: grant.token,
					clientName: grant.clientName,
				},
			});
			return Response.redirect(redirectTo, 302);
		}

		if (url.pathname === "/oauth/denied") {
			const id = url.searchParams.get("req");
			const pending = await load(env, id);
			if (!pending) return new Response("Denied", { status: 400 });
			await env.OAUTH_KV.delete(key(id as string));
			const auth = pending.auth;
			// Checked against the client's registration when the request began.
			const back = new URL(auth.redirectUri);
			back.searchParams.set("error", "access_denied");
			if (auth.state) back.searchParams.set("state", auth.state);
			return Response.redirect(back.href, 302);
		}

		return new Response(
			`${await libraryName(env)} — MCP server. Connect an MCP client to /mcp; it will ask you to sign in.`,
			{
				status: 200,
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"x-robots-tag": "noindex, nofollow",
				},
			},
		);
	},
};

function key(id: string): string {
	return `consent:${id}`;
}

async function load(env: Env, id: string | null): Promise<Pending | null> {
	if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
	return env.OAUTH_KV.get<Pending>(key(id), "json");
}
