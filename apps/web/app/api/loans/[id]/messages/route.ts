import { core } from "../../../../../lib/core.ts";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const { status } = await core(
		`/v1/loans/${encodeURIComponent(id)}/messages`,
		{
			method: "POST",
			body: JSON.stringify({ body: String(form.get("body") ?? "") }),
		},
	);
	const back = `/loans/${encodeURIComponent(id)}`;
	const location =
		status === 401 ? "/login" : status === 201 ? back : `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
