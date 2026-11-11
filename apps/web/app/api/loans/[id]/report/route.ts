import { core } from "../../../../../lib/core.ts";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const body = String(form.get("body") ?? "").trim();
	const kind = String(form.get("kind") ?? "other");
	const back = `/loans/${encodeURIComponent(id)}`;
	// On a page of several loans, the ones the report is about: any number.
	// None ticked is about the meeting, filed on this page's loan, but damage
	// or a loss has to name what it happened to.
	const chosen = [
		...new Set(
			form
				.getAll("loan")
				.map(String)
				.filter((one) => /^[0-9A-Z]{26}$/.test(one)),
		),
	];
	if (form.has("pick") && !chosen.length && ["damage", "loss"].includes(kind))
		return new Response(null, {
			status: 303,
			headers: { location: `${back}?report=${kind}&error=which#report` },
		});
	let status = 201;
	for (const about of chosen.length ? chosen : [id]) {
		({ status } = await core(`/v1/loans/${encodeURIComponent(about)}/report`, {
			method: "POST",
			body: JSON.stringify({ kind, ...(body ? { body } : {}) }),
		}));
		if (status !== 201) break;
	}
	const location =
		status === 401
			? "/login"
			: status === 201
				? `${back}?reported=1`
				: `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
