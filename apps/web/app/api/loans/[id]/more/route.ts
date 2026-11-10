/**
 * "Not now" to what else an owner lends: their suggestions stay away from
 * this browser's loan pages for a month. Only ids are kept, nothing more.
 */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const owner = String(form.get("owner") ?? "");
	const back = `/loans/${encodeURIComponent(id)}`;
	if (!/^[0-9A-Z]{26}$/.test(owner))
		return new Response(null, { status: 303, headers: { location: back } });
	const cookie = request.headers.get("cookie") ?? "";
	const kept =
		/(?:^|;\s*)more-hidden=([0-9A-Z.]*)/.exec(cookie)?.[1]?.split(".") ?? [];
	// The most recent few: an owner put off long ago comes back first.
	const hidden = [...new Set([owner, ...kept.filter(Boolean)])].slice(0, 20);
	return new Response(null, {
		status: 303,
		headers: {
			location: back,
			"set-cookie": `more-hidden=${hidden.join(".")}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax; Secure; HttpOnly`,
		},
	});
}
