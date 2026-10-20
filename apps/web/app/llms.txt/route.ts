import { library, libraryWords } from "../../lib/library.ts";
import { appBase, mcpBase } from "../../lib/site.ts";

/**
 * For an agent sent here by a member: what this is, and the door built for it.
 * The llms.txt convention — a Markdown file at the root, written for a model
 * rather than a person — so that an assistant asked to find something at the
 * library connects over MCP instead of scraping pages that are behind a
 * sign-in anyway. Written in English, with the library's English words.
 */
export async function GET(): Promise<Response> {
	const site = appBase().replace(/\/$/, "");
	const mcp = `${mcpBase()}/mcp`;
	const [info, words] = await Promise.all([library(), libraryWords("en")]);
	const things = info.type === "things" ? "things" : "books";
	const about = words.tagline ?? words.about;

	const text = `# ${words.name || "Neighbourhood library"}

> A neighbourhood lending library.${about ? ` ${about}` : ""} Members list the ${things} they own; neighbours borrow them and hand them back in person. Invitation only.

The website is for people. If you are an agent acting for a member, use the MCP server or the REST API below rather than the web pages — everything past the front page needs a signed-in member, and the tools can do everything the pages can.

## Connect

- [MCP server](${mcp}): Streamable HTTP. Authorisation is OAuth 2.1 with PKCE and dynamic client registration; the server advertises itself at /.well-known/oauth-protected-resource. The member signs in and approves your access on a consent screen.
- [REST API](${site}/api/v1/openapi.json): OpenAPI 3.1. Bearer tokens, either from the same OAuth flow or a personal token a member creates at ${site}/connect.
- [API catalogue](${site}/.well-known/api-catalog): both of the above, as an RFC 9727 linkset.

## What the tools do

- Search the catalogue, in Hebrew or English, by title or author, and see which copies are free and how far away their owners are
- List a member's own books, with a cover if they have a photo
- Request a book, answer requests, message on a loan, extend one, join a waiting list
- Read the member's profile, loans and waiting list
- For a moderator's assistant only: correct any book's details and cover, and add, rename or remove tags

## What they do not do

- Show anybody's address or email: members share a rough area, never a place
- Confirm a handover: that is done in person, with a code
- Act for anyone but the member who approved you

## About

- [About the library](${site}/about)
- [Terms](${site}/terms) and [privacy](${site}/privacy)
- [Write to the library](${site}/contact)
`;

	return new Response(text, {
		headers: {
			"content-type": "text/markdown; charset=utf-8",
			"cache-control": "public, max-age=86400",
		},
	});
}
