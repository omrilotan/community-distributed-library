const EARTH_RADIUS_M = 6_371_000;

export interface Point {
	lat: number;
	lng: number;
}

/** Bounding box first, haversine second — decision 0002, no PostGIS. */
export function boundingBox(centre: Point, radiusM: number) {
	const latDelta = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
	const lngDelta =
		latDelta / Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01);
	return {
		latMin: centre.lat - latDelta,
		latMax: centre.lat + latDelta,
		lngMin: centre.lng - lngDelta,
		lngMax: centre.lng + lngDelta,
	};
}

export function distanceM(from: Point, to: Point): number {
	const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
	const dLat = toRadians(to.lat - from.lat);
	const dLng = toRadians(to.lng - from.lng);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(from.lat)) *
			Math.cos(toRadians(to.lat)) *
			Math.sin(dLng / 2) ** 2;
	return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)));
}

/**
 * Distance is shown rounded, so repeated searches cannot triangulate a home.
 */
export function coarseDistanceM(metres: number): number {
	return Math.max(100, Math.round(metres / 100) * 100);
}

/**
 * Coarse storage for a member's area: snapped to a ~300 m grid so the stored
 * point is never a home.
 */
export function snapArea(point: Point): Point {
	const step = 300 / 111_320; // degrees of latitude per 300 m
	const lngStep = step / Math.max(Math.cos((point.lat * Math.PI) / 180), 0.01);
	return {
		lat: Math.round(point.lat / step) * step,
		lng: Math.round(point.lng / lngStep) * lngStep,
	};
}
