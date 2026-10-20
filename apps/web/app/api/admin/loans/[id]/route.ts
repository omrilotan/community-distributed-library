import { core } from "../../../../../lib/core.ts";

/** Settle a loan whose borrower or owner was suspended. Core checks the rest. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const outcome = String(form.get("outcome") ?? "");
	if (!["cancelled", "returned", "lost"].includes(outcome))
		return new Response("bad outcome", { status: 400 });
	const { status } = await core(
		`/v1/admin/loans/${encodeURIComponent(id)}/close`,
		{ method: "POST", body: JSON.stringify({ outcome }) },
	);
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/admin?settled=1"
				: "/admin?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
