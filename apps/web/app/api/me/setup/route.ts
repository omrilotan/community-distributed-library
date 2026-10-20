import type { Availability } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";

/**
 * One screen of a new member's setup. Each saves only its own part:
 * the meeting place keeps the times already ticked, and the other way round.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const step = String(form.get("step") ?? "");

	// Everyone close by: just the name.
	if (step === "name") {
		const { status } = await core("/v1/me", {
			method: "PATCH",
			body: JSON.stringify({
				displayName: String(form.get("displayName") ?? "").trim(),
			}),
		});
		return status === 204
			? go("/start/setup?step=2")
			: status === 401
				? go("/login")
				: go("/start/setup?step=1&error=1");
	}

	if (step === "area") {
		const label = String(form.get("areaLabel") ?? "").trim();
		// A name alone will do: a known neighbourhood, or the library's centre.
		// A point if the map or the device gave one; a name alone, core places.
		const lat = Number(form.get("lat"));
		const lng = Number(form.get("lng"));
		const point =
			form.get("lat") && Number.isFinite(lat) && Number.isFinite(lng)
				? { lat, lng }
				: {};
		if (!label) return go("/start/setup?step=1&error=area");
		const { status } = await core("/v1/me", {
			method: "PATCH",
			body: JSON.stringify({
				displayName: String(form.get("displayName") ?? "").trim(),
				area: { label, ...point },
			}),
		});
		return status === 204
			? go("/start/setup?step=2")
			: status === 401
				? go("/login")
				: go("/start/setup?step=1&error=1");
	}

	if (step === "place" || step === "times") {
		const now = await core<Availability>("/v1/me/availability");
		if (now.status === 401) return go("/login");
		// Without the part already saved, saving this one would wipe it.
		if (now.status !== 200)
			return go(`/start/setup?step=${step === "place" ? 2 : 3}&error=1`);
		const current = now.body;
		const next: Availability =
			step === "place"
				? {
						slots: current.slots,
						meetingPlace: String(form.get("meetingPlace") ?? "").trim() || null,
					}
				: {
						slots: form
							.getAll("slot")
							.map(String)
							.map((value) => value.split(":"))
							.filter(([weekday, period]) => weekday && period)
							.map(([weekday, period]) => ({
								weekday: Number(weekday),
								period: period as Availability["slots"][number]["period"],
							})),
						meetingPlace: current.meetingPlace,
					};
		const { status } = await core("/v1/me/availability", {
			method: "PUT",
			body: JSON.stringify(next),
		});
		if (status !== 204)
			return go(`/start/setup?step=${step === "place" ? 2 : 3}&error=1`);
		// Set up: straight to the shelves, to find something to borrow.
		return go(step === "place" ? "/start/setup?step=3" : "/");
	}

	return go("/start/setup");
}

function go(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
