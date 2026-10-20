import { core } from "../../../../../lib/core.ts";

/** Approve (settling slug and both labels) or decline a member's suggestion. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const action = String(form.get("action") ?? "");
	const at = `/v1/admin/tag-proposals/${encodeURIComponent(id)}`;

	if (action === "decline") {
		const note = String(form.get("note") ?? "").trim();
		const { status } = await core(`${at}/decline`, {
			method: "POST",
			body: JSON.stringify(note ? { note } : {}),
		});
		return redirect(
			status === 401
				? "/login"
				: status === 204
					? "/admin/tags"
					: "/admin/tags?error=1",
		);
	}
	if (action !== "approve") return new Response("bad action", { status: 400 });

	const namespaceLabelEn = String(form.get("namespaceLabelEn") ?? "").trim();
	const namespaceLabelHe = String(form.get("namespaceLabelHe") ?? "").trim();
	const { status, body } = await core<{ tag: string }>(`${at}/approve`, {
		method: "POST",
		body: JSON.stringify({
			namespace: String(form.get("namespace") ?? "").trim(),
			value: String(form.get("value") ?? "").trim(),
			// Only the library's languages are on the form; an empty one is left out.
			labels: {
				...(String(form.get("labelEn") ?? "").trim()
					? { en: String(form.get("labelEn")).trim() }
					: {}),
				...(String(form.get("labelHe") ?? "").trim()
					? { he: String(form.get("labelHe")).trim() }
					: {}),
			},
			...(namespaceLabelEn || namespaceLabelHe
				? {
						namespaceLabels: {
							...(namespaceLabelEn ? { en: namespaceLabelEn } : {}),
							...(namespaceLabelHe ? { he: namespaceLabelHe } : {}),
						},
					}
				: {}),
		}),
	});
	return redirect(
		status === 401
			? "/login"
			: status === 201
				? `/admin/tags?approved=${encodeURIComponent(body.tag)}`
				: "/admin/tags?error=1",
	);
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
