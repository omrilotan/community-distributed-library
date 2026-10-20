import type { WantedResponse } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";

/** "Ask for it": the form becomes POST /v1/wanted, then the book's own page. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const isbn13 = String(form.get("isbn13") ?? "").replace(/\D/g, "");
	const title = String(form.get("title") ?? "").trim();
	const authors = String(form.get("authors") ?? "")
		.split(",")
		.map((author) => author.trim())
		.filter(Boolean);
	const { status, body } = await core<WantedResponse>("/v1/wanted", {
		method: "POST",
		body: JSON.stringify({
			...(isbn13.length === 13 ? { isbn13 } : {}),
			...(title ? { title } : {}),
			authors,
		}),
	});
	const location =
		status === 401
			? "/login"
			: status === 201
				? `/works/${encodeURIComponent(body.workId)}?waitlisted=1`
				: `/?q=${encodeURIComponent(title)}&error=wanted`;
	return new Response(null, { status: 303, headers: { location } });
}
