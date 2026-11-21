import { core } from "../../../../../lib/core.ts";

/** "Keep it on your shelf?": yes lists it and opens it for a photo; no ends there. */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const form = await request.formData();
	const keep = form.get("keep") === "1";
	const { status } = await core<{ copyId: string | null }>(
		`/v1/ask-offers/${encodeURIComponent(id)}/keep`,
		{ method: "POST", body: JSON.stringify({ keep }) },
	);
	const location =
		status === 401
			? "/login"
			: status === 200
				? keep
					? "/loans?kept=1"
					: "/loans"
				: "/loans?error=keep";
	return new Response(null, { status: 303, headers: { location } });
}
