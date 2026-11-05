import type { Env } from "./env.ts";
import { fragment } from "./cache.ts";
import { distanceM, snapArea } from "./geo.ts";

/**
 * Place names and postcodes, asked from here and never from a member's
 * browser, each from the open service for the library's country:
 *
 * - Britain: postcodes.io, open data from the Ordnance Survey and the ONS, no
 *   key. Postcodes, place names as you type, and the ward around a point.
 * - The United States: Zippopotam.us, GeoNames data, no key. ZIP codes. No
 *   free service suggests US place names as you type.
 * - Naming a point ("Use my location") anywhere postcodes.io does not cover:
 *   OpenStreetMap's Nominatim. One lookup per tap, cached, which its usage
 *   policy allows; it forbids suggestions as you type.
 *
 * Answers are cached for a month, since neither place names nor postcodes
 * move. Whatever comes back is kept only within reach of the library.
 */
const API = "https://api.postcodes.io";
const ZIPPOPOTAM = "https://api.zippopotam.us";
const NOMINATIM = "https://nominatim.openstreetmap.org";
/** Nominatim asks every caller to say who it is. */
const AGENT =
	"community-distributed-library (https://community-distributed-library.com)";
const MONTH = 30 * 24 * 60 * 60;
/** Further than this from the library, a match is somewhere else of the same name. */
const REACH_M = 40_000;

export interface Place {
	name: string;
	lat: number;
	lng: number;
	/** What tells two places apart: their borough or postcode district. */
	detail: string | null;
}

type Ctx = { waitUntil(promise: Promise<unknown>): void } | undefined;
type Point = { lat: number; lng: number };

const FULL_POSTCODE = /^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/i;
const OUTCODE = /^[a-z]{1,2}\d[a-z\d]?$/i;
/** A US ZIP code, with or without its four extra digits. */
const ZIP = /^(\d{5})(?:-?\d{4})?$/;

type Region = "gb" | "us" | null;

/**
 * Which country's service a point belongs to, by rough boxes: Britain and
 * Northern Ireland; the lower 48, Alaska, Hawaii and Puerto Rico. A box takes
 * in a little of a neighbour (Toronto sits in the lower 48's), which costs
 * nothing: an answer from the wrong country is out of the library's reach.
 */
export function regionOf({ lat, lng }: Point): Region {
	const within = (s: number, n: number, w: number, e: number) =>
		lat >= s && lat <= n && lng >= w && lng <= e;
	if (within(49.8, 60.9, -8.7, 1.8)) return "gb";
	if (
		within(24.4, 49.4, -125, -66.9) ||
		within(51, 71.5, -180, -129.9) ||
		within(18.9, 22.3, -160.3, -154.8) ||
		within(17.9, 18.6, -67.3, -65.2)
	)
		return "us";
	return null;
}

/** "n33ss" → "N3 3SS"; a district alone stays as it is. */
export function tidyPostcode(text: string): string {
	const bare = text.replace(/\s+/g, "").toUpperCase();
	return FULL_POSTCODE.test(bare)
		? `${bare.slice(0, -3)} ${bare.slice(-3)}`
		: bare;
}

/**
 * What a member's area may be called: a full postcode narrows a home to a
 * dozen doors, so it becomes its district ("N3 3SS" → "N3"), and a ZIP+4 to a
 * block, so it becomes its ZIP ("11215-1234" → "11215"); anything else stays
 * as typed.
 */
export function areaName(text: string): string {
	const bare = text.replace(/\s+/g, "").toUpperCase();
	if (FULL_POSTCODE.test(bare)) return bare.slice(0, -3);
	const zip = ZIP.exec(bare);
	return zip ? zip[1]! : text.trim();
}

export function looksLikePostcode(text: string): boolean {
	const bare = text.replace(/\s+/g, "");
	return FULL_POSTCODE.test(bare) || OUTCODE.test(bare);
}

/**
 * One question to postcodes.io. Not found is an answer (null); the service
 * being down is not, and throws, so that nothing empty is cached for a month.
 */
async function ask<T>(path: string): Promise<T | null> {
	const response = await fetch(`${API}${path}`, {
		headers: { accept: "application/json" },
	});
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`postcodes.io ${response.status}`);
	const body = (await response.json()) as { result?: T | null };
	return body.result ?? null;
}

/** A cached lookup that, when the service fails, answers `fallback` uncached. */
async function lookup<T>(
	env: Env,
	ctx: Ctx,
	key: string,
	fallback: T,
	build: () => Promise<T>,
): Promise<T> {
	try {
		return await fragment(env, ctx, key, MONTH, build);
	} catch (error) {
		console.error("[places]", error);
		return fallback;
	}
}

async function postcodePlace(text: string): Promise<Place | null> {
	const bare = text.replace(/\s+/g, "");
	const found = FULL_POSTCODE.test(bare)
		? await ask<{
				latitude: number;
				longitude: number;
				admin_district: string;
			}>(`/postcodes/${encodeURIComponent(bare)}`)
		: await ask<{
				latitude: number;
				longitude: number;
				admin_district: string[];
			}>(`/outcodes/${encodeURIComponent(bare)}`);
	if (!found || typeof found.latitude !== "number") return null;
	const district = found.admin_district;
	return {
		// The district, never the full postcode: what is picked becomes a
		// member's area, which neighbours see.
		name: areaName(tidyPostcode(text)),
		lat: found.latitude,
		lng: found.longitude,
		detail: Array.isArray(district)
			? (district[0] ?? null)
			: (district ?? null),
	};
}

/** A ZIP code's place, named by the ZIP itself, from Zippopotam.us. */
async function zipPlace(zip: string): Promise<Place | null> {
	const response = await fetch(`${ZIPPOPOTAM}/us/${zip}`, {
		headers: { accept: "application/json" },
	});
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`zippopotam.us ${response.status}`);
	const body = (await response.json()) as {
		places?: {
			"place name": string;
			latitude: string;
			longitude: string;
			"state abbreviation": string;
		}[];
	};
	const first = body.places?.[0];
	if (!first) return null;
	return {
		name: zip,
		lat: Number(first.latitude),
		lng: Number(first.longitude),
		detail: `${first["place name"]}, ${first["state abbreviation"]}`,
	};
}

/** Places whose name starts like `query`, nearest the library first. */
export async function suggestPlaces(
	env: Env,
	ctx: Ctx,
	centre: Point,
	query: string,
): Promise<Place[]> {
	const q = query.trim();
	if (q.length < 2) return [];
	const region = regionOf(centre);
	if (region === "us") {
		const zip = ZIP.exec(q.replace(/\s+/g, ""))?.[1];
		if (!zip) return [];
		const one = await lookup(env, ctx, `place:zip:${zip}`, null, () =>
			zipPlace(zip),
		);
		return one && distanceM(centre, one) <= REACH_M ? [one] : [];
	}
	if (region !== "gb") return [];
	if (looksLikePostcode(q)) {
		const one = await lookup(
			env,
			ctx,
			`place:pc:${tidyPostcode(q)}`,
			null,
			() => postcodePlace(q),
		);
		return one ? [one] : [];
	}
	const found = await lookup(
		env,
		ctx,
		`place:q:${q.toLowerCase()}`,
		[] as Place[],
		async () =>
			(
				(await ask<
					{
						name_1: string;
						latitude: number;
						longitude: number;
						district_borough: string | null;
						outcode: string | null;
					}[]
				>(`/places?q=${encodeURIComponent(q)}&limit=100`)) ?? []
			).map((place): Place => ({
				name: place.name_1,
				lat: place.latitude,
				lng: place.longitude,
				detail: place.district_borough ?? place.outcode ?? null,
			})),
	);
	const seen = new Set<string>();
	return found
		.map((place) => ({ place, metres: distanceM(centre, place) }))
		.filter(({ metres }) => metres <= REACH_M)
		.sort((a, b) => a.metres - b.metres)
		.map(({ place }) => place)
		.filter((place) => {
			const key = place.name.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, 8);
}

/** Where a typed name or postcode is, if it is near the library. */
export async function resolvePlace(
	env: Env,
	ctx: Ctx,
	centre: Point,
	label: string,
): Promise<Point | null> {
	const places = await suggestPlaces(env, ctx, centre, label);
	const exact = places.find(
		(place) => place.name.toLowerCase() === label.trim().toLowerCase(),
	);
	const place = exact ?? places[0] ?? null;
	return place ? { lat: place.lat, lng: place.lng } : null;
}

/**
 * The name of the area around a point: its ward, as people use it ("East
 * Finchley"), or failing that the postcode district. Only the snapped point,
 * a few hundred metres off, is ever sent.
 */
export async function placeAt(
	env: Env,
	ctx: Ctx,
	point: Point,
): Promise<string | null> {
	const snapped = snapArea(point);
	// "at2": a point outside the UK was cached nameless before Nominatim.
	const key = `place:at2:${snapped.lat.toFixed(4)},${snapped.lng.toFixed(4)}`;
	return lookup(env, ctx, key, null as string | null, async () => {
		if (regionOf(snapped) !== "gb") return nominatimAt(snapped);
		const found = await ask<
			{ admin_ward: string | null; outcode: string | null }[]
		>(`/postcodes?lon=${snapped.lng}&lat=${snapped.lat}&limit=1&radius=1000`);
		const first = found?.[0];
		return first?.admin_ward ?? first?.outcode ?? (await nominatimAt(snapped));
	});
}

/**
 * The neighbourhood around a point, from OpenStreetMap: the suburb where
 * there is one (Ramot, in Jerusalem), else the next size up. Only the
 * rounded point goes. A failure throws, so nothing empty is cached.
 */
async function nominatimAt(point: Point): Promise<string | null> {
	const response = await fetch(
		`${NOMINATIM}/reverse?format=jsonv2&zoom=14&lat=${point.lat}&lon=${point.lng}`,
		{ headers: { accept: "application/json", "user-agent": AGENT } },
	);
	if (!response.ok) throw new Error(`nominatim ${response.status}`);
	const { address } = (await response.json()) as {
		address?: Record<string, string>;
	};
	if (!address) return null;
	return (
		address.suburb ??
		address.neighbourhood ??
		address.quarter ??
		address.city_district ??
		address.village ??
		address.town ??
		address.city ??
		null
	);
}
