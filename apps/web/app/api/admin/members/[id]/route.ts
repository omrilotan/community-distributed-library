import { core } from "../../../../../lib/core.ts";
import { safePath } from "../../../../../lib/safe-path.ts";

/**
 * One form, three levers: a `role`, a `status`, or `invites=revoke`,
 * whichever the form carried. Core decides who may pull which.
 */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const back = safePath(form.get("back"), "/admin/members");
	const role = form.get("role");
	const statusChange = form.get("status");
	const member = `/v1/admin/members/${encodeURIComponent(id)}`;

	const { status } =
		form.get("invites") === "revoke"
			? await core(`${member}/invites/revoke`, { method: "POST" })
			: await core(`${member}/${role ? "role" : "status"}`, {
					method: "POST",
					body: JSON.stringify(role ? { role } : { status: statusChange }),
				});
	const ok = status === 204 || status === 200;
	const location =
		status === 401
			? "/login"
			: ok
				? back
				: `${back}${back.includes("?") ? "&" : "?"}error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
