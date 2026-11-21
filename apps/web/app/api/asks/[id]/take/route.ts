import { core } from "../../../../../lib/core.ts";

/** "Take this one": the offer becomes a loan, and the asker lands on it. */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const form = await request.formData();
	const offerId = String(form.get("offerId") ?? "");
	const { status, body } = await core<{ loanId: string }>(
		`/v1/asks/${encodeURIComponent(id)}/offers/${encodeURIComponent(offerId)}/take`,
		{ method: "POST", body: "{}" },
	);
	const location =
		status === 401
			? "/login"
			: status === 201
				? `/loans/${encodeURIComponent(body.loanId)}`
				: "/loans?error=offer#asks";
	return new Response(null, { status: 303, headers: { location } });
}
