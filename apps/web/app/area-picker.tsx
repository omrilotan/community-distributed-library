"use client";

import { useEffect, useRef, useState } from "react";
import { AreaMap } from "./area-map.tsx";

type Point = { lat: number; lng: number };
type Place = Point & { name: string; detail: string | null };

/**
 * How far from a library a member's located point may be: as far as core
 * looks for the places it suggests (places.ts, REACH_M).
 */
export const MEMBER_REACH_M = 40_000;

interface Labels {
	area: string;
	areaHint: string;
	locate: string;
	located: string;
	/** Located, but no place name came back: the name is still to type. */
	locatedNoName: string;
	/** Located somewhere far from the library: not kept. */
	locatedFar: string;
	locateFailed: string;
	mapHint: string;
	mapMore: string;
	you: string;
}

/**
 * Where a member lives, as easily as possible: type a neighbourhood or a
 * postcode (places near the library are suggested as you type, and picking
 * one places you), or tap "Use my location" beside the field, which names the
 * area for you. The map is there to be more exact. Names come from core, so
 * nothing about places is kept here.
 */
export function AreaPicker({
	centre,
	initial,
	labels,
	optional = false,
	reach,
}: {
	centre: Point;
	initial: { label: string; lat: number; lng: number } | null;
	labels: Labels;
	/** The library's own centre has a point already; its name may stay empty. */
	optional?: boolean;
	/**
	 * How far from the centre, in metres, a member's located point may be.
	 * A phone abroad is not where its owner lives in this library.
	 */
	reach?: number;
}) {
	const [label, setLabel] = useState(initial?.label ?? "");
	const [point, setPoint] = useState<Point | null>(
		initial ? { lat: initial.lat, lng: initial.lng } : null,
	);
	// Set this visit by a tap on the map or by the device: from then on a
	// typed name no longer moves the pin. A saved point does not count, so a
	// member who picks another neighbourhood is moved there.
	const [exact, setExact] = useState(false);
	const [state, setState] = useState<
		"idle" | "locating" | "ok" | "unnamed" | "far" | "failed"
	>("idle");
	const field = useRef<HTMLInputElement>(null);
	// The map is for being exact; it is built only once somebody opens it.
	const [mapOpen, setMapOpen] = useState(false);

	// Suggestions for what is typed, a moment after the typing stops.
	const [places, setPlaces] = useState<Place[]>([]);
	const asked = useRef("");
	useEffect(() => {
		const q = label.trim();
		if (q.length < 2 || q === asked.current) return;
		const timer = setTimeout(() => {
			asked.current = q;
			fetch(`/api/places?q=${encodeURIComponent(q)}`)
				.then((response) => (response.ok ? response.json() : { places: [] }))
				.then((body) => setPlaces((body as { places?: Place[] }).places ?? []))
				.catch(() => undefined);
		}, 250);
		return () => clearTimeout(timer);
	}, [label]);

	function typed(value: string) {
		setLabel(value);
		if (exact) return;
		const known = places.find(
			(place) => place.name.toLowerCase() === value.trim().toLowerCase(),
		);
		// A suggested name places you; any other name is sent without a point,
		// and core places it when it is saved.
		setPoint(known ? { lat: known.lat, lng: known.lng } : null);
		setState("idle");
	}

	function locate() {
		if (!("geolocation" in navigator)) {
			setState("failed");
			return;
		}
		setState("locating");
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const here = { lat: coords.latitude, lng: coords.longitude };
				if (reach && distanceM(here, centre) > reach) {
					setState("far");
					field.current?.focus();
					return;
				}
				setPoint(here);
				setExact(true);
				setState("ok");
				// Name the area for them, unless they already have. Where no name
				// comes back (somewhere the place names do not cover), say the
				// name is still to type rather than leave the field empty.
				const unnamed = () => {
					setState("unnamed");
					field.current?.focus();
				};
				if (!label.trim())
					fetch(`/api/places/at?lat=${here.lat}&lng=${here.lng}`)
						.then((response) => (response.ok ? response.json() : null))
						.then((reply) => {
							const body = reply as { name?: string | null } | null;
							if (body?.name)
								setLabel((now) => (now.trim() ? now : body.name!));
							else unnamed();
						})
						.catch(unnamed);
			},
			() => setState("failed"),
			{ enableHighAccuracy: false, timeout: 10_000 },
		);
	}

	return (
		<div className="area-picker">
			<label htmlFor="areaLabel">{labels.area}</label>
			<div className="field-with-button">
				<input
					ref={field}
					id="areaLabel"
					name="areaLabel"
					type="text"
					dir="auto"
					required={!optional}
					list="neighbourhoods"
					autoComplete="off"
					value={label}
					onChange={(event) => typed(event.target.value)}
					placeholder={labels.areaHint}
				/>
				<button
					type="button"
					className="secondary"
					onClick={locate}
					disabled={state === "locating"}
				>
					{labels.locate}
				</button>
			</div>
			<datalist id="neighbourhoods">
				{places.map((place) => (
					<option key={`${place.name}|${place.detail}`} value={place.name}>
						{place.detail ?? ""}
					</option>
				))}
			</datalist>
			<div role="status">
				{state === "ok" ? <p className="muted">{labels.located}</p> : null}
				{state === "unnamed" ? (
					<p className="muted">{labels.locatedNoName}</p>
				) : null}
				{state === "far" ? <p className="muted">{labels.locatedFar}</p> : null}
				{state === "failed" ? (
					<p className="muted">{labels.locateFailed}</p>
				) : null}
			</div>
			<input type="hidden" name="lat" value={point?.lat ?? ""} />
			<input type="hidden" name="lng" value={point?.lng ?? ""} />
			<details
				className="area-map-more"
				onToggle={(event) => setMapOpen(event.currentTarget.open)}
			>
				<summary>{labels.mapMore}</summary>
				<p className="muted">{labels.mapHint}</p>
				{mapOpen ? (
					<AreaMap
						centre={centre}
						zoom={13}
						pick={{
							initial: point,
							point,
							onPick: (picked) => {
								setPoint(picked);
								setExact(true);
							},
						}}
						labels={{
							you: labels.you,
							locate: labels.locate,
							located: labels.located,
							locateFailed: labels.locateFailed,
						}}
					/>
				) : null}
			</details>
		</div>
	);
}

/** Metres between two points, on a round Earth: plenty for "too far". */
function distanceM(a: Point, b: Point): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLng = (b.lng - a.lng) * rad;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
