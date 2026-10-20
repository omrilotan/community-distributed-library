import { core } from "../../../../../lib/core.ts";

/** One route, four levers: propose (day+period), confirm, cancel, complete (code). */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const action = String(form.get("action") ?? "");
	const back = `/loans/${encodeURIComponent(id)}`;
	const base = `/v1/loans/${encodeURIComponent(id)}/handoff`;

	let result: { status: number };
	if (action === "propose") {
		const [day, period] = String(form.get("slot") ?? "").split("|");
		result = await core(`${base}/propose`, {
			method: "POST",
			body: JSON.stringify({ day, period }),
		});
	} else if (action === "complete") {
		result = await core(`${base}/complete`, {
			method: "POST",
			body: JSON.stringify({ code: String(form.get("code") ?? "") }),
		});
	} else if (action === "confirm" || action === "cancel") {
		result = await core(`${base}/${action}`, { method: "POST" });
	} else {
		return new Response("bad action", { status: 400 });
	}

	const location =
		result.status === 401
			? "/login"
			: result.status < 300
				? `${back}?handoff=${action}`
				: result.status === 403 && action === "complete"
					? `${back}?error=code`
					: `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
