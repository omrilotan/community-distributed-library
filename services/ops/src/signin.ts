import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env } from "./env.ts";
import { same } from "./keys.ts";

/**
 * The operator's sign-in, for MCP clients that connect with OAuth (claude.ai,
 * Claude desktop and mobile). There is one operator and one key, so signing
 * in is typing that key (.keys/ops.key) on this page: whoever has it may ask
 * about every library, by header or by sign-in alike.
 *
 *   client → /authorize (this page) → the key → back to the client
 *
 * The page shows where the client will send the grant, so a link from
 * someone else's client is seen for what it is before the key goes in.
 */

const escape = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[char]!,
	);

const PAGE_HEADERS = {
	"content-type": "text/html; charset=utf-8",
	"cache-control": "no-store",
	"content-security-policy":
		"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
	"x-frame-options": "DENY",
	"referrer-policy": "no-referrer",
	"x-robots-tag": "noindex, nofollow",
};

function page({
	handle,
	clientName,
	redirectHost,
	loopback,
}: {
	handle: string;
	clientName: string;
	redirectHost: string;
	loopback: boolean;
}): string {
	return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in to cdl-ops</title>
<style>
	body { font: 16px/1.5 system-ui, sans-serif; max-width: 28rem; margin: 3rem auto; padding: 0 1rem; color: #1a1a1a; background: #fff; }
	@media (prefers-color-scheme: dark) { body { color: #eee; background: #161616; } input { color: inherit; background: #222; } }
	h1 { font-size: 1.4rem; }
	strong { overflow-wrap: anywhere; }
	label { display: block; margin: 1.5rem 0 0.25rem; }
	input[type=password] { width: 100%; box-sizing: border-box; padding: 0.5rem; font: inherit; border: 1px solid #888; border-radius: 4px; }
	.buttons { display: flex; gap: 0.75rem; margin-top: 1rem; }
	button { font: inherit; padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #888; cursor: pointer; }
	button[value=allow] { background: #1a5fb4; color: #fff; border-color: #1a5fb4; }
	.warn { color: #b3261e; }
</style>
<h1>Sign in to cdl-ops</h1>
<p><strong>${escape(clientName)}</strong> asks to read every library you run, as the operator.</p>
<p>It will be sent to <strong>${escape(redirectHost)}</strong>.${
		loopback
			? ` <span class="warn">That is this computer: any program on it could be listening.</span>`
			: ""
	} If you did not start this, close the page.</p>
<form method="post" action="/authorize">
	<input type="hidden" name="handle" value="${escape(handle)}">
	<label for="key">The operator's key (.keys/ops.key)</label>
	<input id="key" name="key" type="password" autocomplete="current-password" required autofocus>
	<div class="buttons">
		<button name="decision" value="allow">Allow</button>
		<button name="decision" value="deny" formnovalidate>Deny</button>
	</div>
</form>
</html>
`;
}

function local(text: string, status: number): Response {
	return new Response(text, {
		status,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"x-robots-tag": "noindex, nofollow",
		},
	});
}

/** The page, with the headers that bind its handle to this browser. */
async function show(
	env: Env,
	auth: AuthRequest,
	handle: string,
	headers: Headers,
): Promise<Response> {
	const about = await env.OAUTH_PROVIDER.describeConsent(auth);
	const response = new Headers(headers);
	for (const [name, value] of Object.entries(PAGE_HEADERS))
		response.set(name, value);
	return new Response(
		page({
			handle,
			clientName: about.clientName,
			redirectHost: about.redirectHost,
			loopback: about.redirectIsLoopback,
		}),
		{ headers: response },
	);
}

export const signIn = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/authorize" && request.method === "GET") {
			let auth: AuthRequest;
			try {
				auth = await env.OAUTH_PROVIDER.parseAuthRequest(request);
			} catch (error) {
				return local(`Bad authorization request: ${String(error)}`, 400);
			}
			const { handle, headers } = await env.OAUTH_PROVIDER.beginConsent(auth);
			return show(env, auth, handle, headers);
		}

		if (url.pathname === "/authorize" && request.method === "POST") {
			const form = await request.formData().catch(() => null);
			const handle = String(form?.get("handle") ?? "");
			if (form?.get("decision") === "deny") {
				try {
					const { headers } = await env.OAUTH_PROVIDER.denyConsent(
						request,
						handle,
					);
					return new Response(null, { status: 302, headers });
				} catch {
					return local("Sign-in expired. Start again from your client.", 410);
				}
			}
			// Guessing is rationed per address; the key itself is 256 bits.
			const caller = request.headers.get("cf-connecting-ip") ?? "unknown";
			const { success } = await env.SIGNIN_LIMIT.limit({ key: caller });
			if (!success) return local("Too many tries. Wait a minute.", 429);
			if (!(await same(String(form?.get("key") ?? ""), env.OPS_TOKEN ?? ""))) {
				// The handle stays unused: going back asks again.
				return local("That is not the key. Go back and try again.", 401);
			}
			let approved;
			try {
				approved = await env.OAUTH_PROVIDER.approveConsent(request, handle);
			} catch {
				return local("Sign-in expired. Start again from your client.", 410);
			}
			const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
				request: approved.request,
				userId: "operator",
				metadata: {},
				scope: approved.request.scope,
				props: { operator: true },
			});
			const headers = new Headers(approved.headers);
			headers.set("location", redirectTo);
			return new Response(null, { status: 302, headers });
		}

		if (url.pathname === "/")
			return local(
				"cdl-ops: the operator's MCP is at /mcp. Connect with the key as a bearer token, or sign in with it.\n",
				200,
			);
		if (url.pathname === "/robots.txt")
			return local("User-agent: *\nDisallow: /\n", 200);
		return local("Not found", 404);
	},
};
