import { core } from "../../../../../lib/core.ts";

/** Resolve or dismiss, with an optional note. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const action = String(form.get("action") ?? "");
	if (action !== "resolve" && action !== "dismiss")
		return new Response("bad action", { status: 400 });
	const resolution = String(form.get("resolution") ?? "").trim();
	const { status } = await core(
		`/v1/admin/reports/${encodeURIComponent(id)}/${action}`,
		{
			method: "POST",
			body: JSON.stringify(resolution ? { resolution } : {}),
		},
	);
	const location =
		status === 401 ? "/login" : status === 204 ? "/admin" : "/admin?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
