import { core } from "../../../lib/core.ts";

/** The contact form, through the same endpoint any client would call. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const topic = String(form.get("topic") ?? "feedback");
	const body = String(form.get("body") ?? "").trim();
	const email = String(form.get("email") ?? "").trim();
	const back = `/contact?topic=${encodeURIComponent(topic)}`;

	const { status } = await core("/v1/contact", {
		method: "POST",
		body: JSON.stringify({ topic, body, ...(email ? { email } : {}) }),
	});
	const location =
		status === 201
			? `${back}&sent=1`
			: status === 429
				? `${back}&error=rate`
				: `${back}&error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
