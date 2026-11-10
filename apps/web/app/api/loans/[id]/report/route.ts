import { core } from "../../../../../lib/core.ts";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const body = String(form.get("body") ?? "").trim();
	// On a page of several loans, the one the report is about.
	const chosen = String(form.get("loan") ?? "");
	const about = /^[0-9A-Z]{26}$/.test(chosen) ? chosen : id;
	const { status } = await core(
		`/v1/loans/${encodeURIComponent(about)}/report`,
		{
			method: "POST",
			body: JSON.stringify({
				kind: String(form.get("kind") ?? "other"),
				...(body ? { body } : {}),
			}),
		},
	);
	const back = `/loans/${encodeURIComponent(id)}`;
	const location =
		status === 401
			? "/login"
			: status === 201
				? `${back}?reported=1`
				: `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
