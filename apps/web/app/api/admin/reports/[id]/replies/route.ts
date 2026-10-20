import { core } from "../../../../../../lib/core.ts";

/** A moderator writes to the member who filed the report. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const { status } = await core(
		`/v1/admin/reports/${encodeURIComponent(id)}/replies`,
		{
			method: "POST",
			body: JSON.stringify({ body: String(form.get("body") ?? "") }),
		},
	);
	const back = `/admin/reports/${encodeURIComponent(id)}`;
	const location =
		status === 401 ? "/login" : status === 204 ? back : `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
