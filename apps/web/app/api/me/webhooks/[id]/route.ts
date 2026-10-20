import { core } from "../../../../../lib/core.ts";

/** `action` is delete or test; both land back on the connect page. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const action = String(form.get("action") ?? "");
	const path = `/v1/me/webhooks/${encodeURIComponent(id)}`;
	let flag = "error=1";
	if (action === "delete") {
		const { status } = await core(path, { method: "DELETE" });
		if (status === 401) return redirect("/login");
		if (status === 204) flag = "webhook=removed";
	} else if (action === "test") {
		const { status, body } = await core<{ ok: boolean; status: number | null }>(
			`${path}/test`,
			{ method: "POST" },
		);
		if (status === 401) return redirect("/login");
		if (status === 202)
			flag = body.ok ? "webhook=ok" : `webhook=failed&code=${body.status ?? 0}`;
	} else {
		return new Response("bad action", { status: 400 });
	}
	return redirect(`/connect?${flag}#webhooks`);
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
