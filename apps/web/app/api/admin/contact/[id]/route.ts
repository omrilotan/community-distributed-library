import { core } from "../../../../../lib/core.ts";

/** Mark a message to the library as dealt with, or open it again. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const action = form.get("action") === "reopen" ? "reopen" : "handled";
	const page = Math.max(1, Number(form.get("page") ?? 1) || 1);
	const { status } = await core(
		`/v1/admin/contact/${encodeURIComponent(id)}/${action}`,
		{ method: "POST" },
	);
	const back = `/admin/messages?page=${page}`;
	const location =
		status === 401 ? "/login" : status === 204 ? back : `${back}&error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
