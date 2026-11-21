import { core } from "../../../../../lib/core.ts";

/** "I have one": the offer form becomes POST /v1/asks/:id/offers. */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const form = await request.formData();
	const come = String(form.get("come") ?? "now");
	// Each way of coming by has its own time field; only the chosen one counts.
	const time = String(
		form.get(come === "later" ? "from" : "until") ?? "",
	).trim();
	const note = String(form.get("note") ?? "").trim();
	const meetingPlace = String(form.get("meetingPlace") ?? "").trim();
	const { status, body } = await core<{ title?: string }>(
		`/v1/asks/${encodeURIComponent(id)}/offers`,
		{
			method: "POST",
			body: JSON.stringify({
				name: String(form.get("name") ?? "").trim(),
				come,
				...(come !== "usual" && time ? { time } : {}),
				...(note ? { note } : {}),
				...(meetingPlace ? { meetingPlace } : {}),
			}),
		},
	);
	const back = `/asks/${encodeURIComponent(id)}`;
	const location =
		status === 401
			? "/login"
			: status === 201
				? `${back}?offered=1`
				: `${back}?error=${body?.title === "Say where" ? "place" : "offer"}`;
	return new Response(null, { status: 303, headers: { location } });
}
