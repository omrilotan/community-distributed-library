import { core } from "../../../../../lib/core.ts";
import { safePath } from "../../../../../lib/safe-path.ts";

/** The reporter writes to the moderators about their report. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const back = safePath(form.get("back"), "/loans");
	const { status } = await core(
		`/v1/reports/${encodeURIComponent(id)}/replies`,
		{
			method: "POST",
			body: JSON.stringify({ body: String(form.get("body") ?? "") }),
		},
	);
	const location =
		status === 401 ? "/login" : status === 204 ? back : `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
