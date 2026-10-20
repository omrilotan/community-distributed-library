import { core } from "../../../../lib/core.ts";
import { locales } from "../../../../lib/i18n.ts";
import { forgetLibrary } from "../../../../lib/library.ts";

/** Save the library's settings. Core checks the admin and every value. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const number = (name: string) => Number(form.get(name));
	// Each language's words; an empty field is left out, so it shows nothing.
	// A language without its fields on the form keeps what it had.
	const texts: Record<string, Record<string, string>> = {};
	for (const language of locales) {
		if (!form.has(`text-${language}-name`)) continue;
		const text: Record<string, string> = {};
		for (const field of ["name", "shortName", "tagline", "about"]) {
			const value = String(form.get(`text-${language}-${field}`) ?? "").trim();
			if (value) text[field] = value;
		}
		texts[language] = text;
	}
	const { status } = await core("/v1/admin/settings", {
		method: "PATCH",
		body: JSON.stringify({
			name: String(form.get("name") ?? ""),
			loanDays: number("loanDays"),
			memberInvitesOpen: number("memberInvitesOpen"),
			memberInviteDays: number("memberInviteDays"),
			defaultLocale: String(form.get("defaultLocale") ?? "en"),
			languages: String(form.get("languages") ?? "en,he").split(","),
			// Where the library is: the place picker's name, and its point when
			// a suggestion or the map gave one (a name alone, core places).
			...centre(form),
			...(Number(form.get("radiusM")) > 0
				? { radiusM: Number(form.get("radiusM")) }
				: {}),
			compact: String(form.get("compact") ?? "0") === "1",
			// The colour picked: the house green (none), a named one, or the
			// library's own from the colour field.
			...accent(form),
			...(Object.keys(texts).length ? { texts } : {}),
		}),
	});
	// The language visitors get is read from a minute's memory; start over.
	if (status === 204) forgetLibrary();
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/admin/settings?saved=1"
				: "/admin/settings?error=1";
	return new Response(null, { status: 303, headers: { location } });
}

function centre(form: FormData): { centre?: object } {
	const label = String(form.get("areaLabel") ?? "").trim();
	const lat = Number(form.get("lat"));
	const lng = Number(form.get("lng"));
	const point =
		form.get("lat") && Number.isFinite(lat) && Number.isFinite(lng)
			? { lat, lng }
			: {};
	if (!label && !("lat" in point)) return {};
	return { centre: { label, ...point } };
}

function accent(form: FormData): { accent?: string | null } {
	const pick = String(form.get("accentPick") ?? "");
	if (pick === "house") return { accent: null };
	if (pick === "own") return { accent: String(form.get("accentOwn") ?? "") };
	if (/^#[0-9a-f]{6}$/i.test(pick)) return { accent: pick };
	return {};
}
