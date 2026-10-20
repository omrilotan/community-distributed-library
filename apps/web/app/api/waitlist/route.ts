import { core } from "../../../lib/core.ts";

export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const workId = String(form.get("workId") ?? "");
	const { status } = await core("/v1/waitlist", {
		method: "POST",
		body: JSON.stringify({ workId }),
	});
	const back = `/works/${encodeURIComponent(workId)}`;
	const location =
		status === 401
			? "/login"
			: status === 201
				? `${back}?waitlisted=1`
				: `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
