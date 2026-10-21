import { core } from "../../../lib/core.ts";

/**
 * The profile's one Save: name, area, how you lend and the language, and,
 * once set up, when and where you meet.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const label = String(form.get("areaLabel") ?? "").trim();
	const locale = String(form.get("locale") ?? "en");
	const limitRaw = String(form.get("lendLimit") ?? "").trim();
	const lendLimit = limitRaw ? Number(limitRaw) : null;
	// A date in the browser's own format; store the end of that day, so "back
	// on the 5th" means the 5th is a day at home.
	const awayRaw = String(form.get("awayUntil") ?? "").trim();
	const awayUntil = /^\d{4}-\d{2}-\d{2}$/.test(awayRaw)
		? Math.floor(Date.parse(`${awayRaw}T00:00:00Z`) / 1000)
		: null;

	// The area is required: distance is what makes the storefront useful. A
	// point if the map or the device gave one; a name alone, core places.
	const lat = Number(form.get("lat"));
	const lng = Number(form.get("lng"));
	const point =
		form.get("lat") && Number.isFinite(lat) && Number.isFinite(lng)
			? { lat, lng }
			: {};
	// A library where everyone lives close by asks for no area at all.
	const noArea = String(form.get("noArea") ?? "") === "1";
	if (!label && !noArea) {
		return new Response(null, {
			status: 303,
			headers: { location: "/settings?error=area" },
		});
	}

	const { status } = await core("/v1/me", {
		method: "PATCH",
		body: JSON.stringify({
			displayName: String(form.get("displayName") ?? "").trim(),
			locale,
			lendLimit: Number.isFinite(lendLimit) && lendLimit ? lendLimit : null,
			// An empty field is a member who is back.
			awayUntil: awayUntil && awayUntil > Date.now() / 1000 ? awayUntil : null,
			...(label ? { area: { label, ...point } } : {}),
		}),
	});

	// When and where you meet: on the page only once you are set up.
	let met = 204;
	if (status === 204 && form.get("withAvailability") === "1") {
		const slots = form
			.getAll("slot")
			.map(String)
			.map((value) => value.split(":"))
			.filter(([weekday, period]) => weekday && period)
			.map(([weekday, period]) => ({ weekday: Number(weekday), period }));
		const meetingPlace = String(form.get("meetingPlace") ?? "").trim() || null;
		const meetingNote = String(form.get("meetingNote") ?? "").trim() || null;
		met = (
			await core("/v1/me/availability", {
				method: "PUT",
				body: JSON.stringify({ slots, meetingPlace, meetingNote }),
			})
		).status;
	}

	const first = String(form.get("first") ?? "") === "1";
	const location =
		status === 401 || met === 401
			? "/login"
			: status === 204 && met === 204
				? first
					? "/shelf/add?first=1"
					: "/settings?saved=1"
				: "/settings?error=1";
	return new Response(null, {
		status: 303,
		headers: {
			location,
			"set-cookie": `locale=${locale === "he" ? "he" : "en"}; Path=/; Max-Age=31536000; SameSite=Lax`,
		},
	});
}
