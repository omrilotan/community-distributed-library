import { core } from "../../../../lib/core.ts";

/**
 * A moderator adding a tag. The group is either one that exists, or — when
 * "new group" is chosen — the slug and two names given alongside.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const text = (name: string) => String(form.get(name) ?? "").trim();
	const chosen = text("namespace");
	const namespace = chosen || text("newNamespace");
	const { status, body } = await core<{ tag: string }>("/v1/admin/tags", {
		method: "POST",
		body: JSON.stringify({
			namespace,
			value: text("value"),
			// Only the library's languages are on the form; an empty one is left out.
			labels: {
				...(text("labelEn") ? { en: text("labelEn") } : {}),
				...(text("labelHe") ? { he: text("labelHe") } : {}),
			},
			...(chosen
				? {}
				: {
						namespaceLabels: {
							...(text("namespaceLabelEn")
								? { en: text("namespaceLabelEn") }
								: {}),
							...(text("namespaceLabelHe")
								? { he: text("namespaceLabelHe") }
								: {}),
						},
					}),
		}),
	});
	return redirect(
		status === 401
			? "/login"
			: status === 201
				? `/admin/tags?added=${encodeURIComponent(body.tag)}`
				: status === 409
					? "/admin/tags?error=exists"
					: "/admin/tags?error=1",
	);
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
