import { core } from "../../../../../lib/core.ts";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const body = String(form.get("body") ?? "").trim();
	const { status } = await core(`/v1/loans/${encodeURIComponent(id)}/report`, {
		method: "POST",
		body: JSON.stringify({
			kind: String(form.get("kind") ?? "other"),
			...(body ? { body } : {}),
		}),
	});
	const back = `/loans/${encodeURIComponent(id)}`;
	const location =
		status === 401
			? "/login"
			: status === 201
				? `${back}?reported=1`
				: `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
