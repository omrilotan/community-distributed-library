import { core } from "../../../lib/core.ts";

/** "Ask the neighbours": the form becomes POST /v1/asks, then the loans page, where its offers will show. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const what = String(form.get("what") ?? "").trim();
	const note = String(form.get("note") ?? "").trim();
	const { status } = await core<{ id: string }>("/v1/asks", {
		method: "POST",
		body: JSON.stringify({
			what,
			...(note ? { note } : {}),
			by: String(form.get("by") ?? "today"),
			days: Number(form.get("days") ?? 1),
		}),
	});
	const location =
		status === 401
			? "/login"
			: status === 201
				? "/loans?asked=1#asks"
				: `/?${new URLSearchParams({
						...(what ? { q: what } : {}),
						error: status === 409 ? "asks" : "ask",
					}).toString()}`;
	return new Response(null, { status: 303, headers: { location } });
}
