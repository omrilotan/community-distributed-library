import { SCOPE_DESCRIPTIONS, SCOPES } from "@cdl/contracts";
import { library, libraryWords } from "../../lib/library.ts";
import { appBase, mcpBase } from "../../lib/site.ts";

/**
 * For an agent asked to sign a person up, or to sign in for one: the auth.md
 * convention (github.com/workos/auth.md), a Markdown file at the root saying
 * how an agent gets credentials. Here the answer to registering is no:
 * membership is by invitation, accepted by a person. So the file stands on
 * its own, with no agent_auth block or registration endpoint, and says how a
 * member who already belongs lets an agent act for them.
 */
export async function GET(): Promise<Response> {
	const site = appBase().replace(/\/$/, "");
	const mcp = mcpBase();
	const [info, words] = await Promise.all([library(), libraryWords("en")]);
	const name = words.name || "Neighbourhood library";
	const things = info.type === "things" ? "things" : "books";
	const scopes = SCOPES.map(
		(scope) =>
			`- \`${scope}\`: ${SCOPE_DESCRIPTIONS[scope].en}${scope === "admin" ? " (offered to moderators only)" : ""}`,
	).join("\n");

	const text = `# ${name} auth.md

> How an agent gets access to ${name}, a neighbourhood lending library of ${things}. Invitation only.

## Who this is for

An agent acting for one member of the library, with that member's approval. Every credential acts as that member and nobody else.

## Registration

Agents cannot register here, for themselves or for a person. There is no registration endpoint, anonymous or verified. A person joins by an invitation from a neighbour, accepted in a browser. If the person you act for is not a member, tell them to ask a member for an invitation.

## Access for a member's agent

### OAuth 2.1, for the MCP server

- Resource: ${mcp}/mcp (MCP, Streamable HTTP)
- Protected resource metadata: ${mcp}/.well-known/oauth-protected-resource/mcp
- Authorization server metadata: ${mcp}/.well-known/oauth-authorization-server
- Client registration: dynamic (RFC 7591) at ${mcp}/register. This registers your client software, not an account.
- Authorization code with PKCE (S256). The member signs in and approves your client on a consent screen, choosing which of the scopes you ask for to allow.
- Refresh tokens are issued. Revoke at ${mcp}/token (RFC 7009).

### Personal token, for the REST API

The member creates a token at ${site}/connect, chooses its scopes, and gives it to you. Send it to the [REST API](${site}/api/v1/openapi.json) as \`Authorization: Bearer <token>\`. It is shown to the member once.

## Scopes

${scopes}

## Using credentials

- Send the token in the \`Authorization: Bearer\` header only. A browser session cookie is never accepted by the API.
- Do only what the member asked. Before anything that changes something or reaches another member, tell the member what you will do and wait for their yes.
- The member sees every connection on their profile at ${site}/settings and can disconnect it there at any time. A disconnected token stops working at once.

## More

- [llms.txt](${site}/llms.txt): what the library is and what the tools do
- [API catalogue](${site}/.well-known/api-catalog)
`;

	return new Response(text, {
		headers: {
			"content-type": "text/markdown; charset=utf-8",
			"cache-control": "public, max-age=86400",
		},
	});
}
