"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
	lat: number;
	lng: number;
	label: string;
}

/**
 * One map for two jobs. `pick` makes it a picker: a draggable pin whose
 * position lands in hidden `lat`/`lng` inputs. Otherwise it shows areas:
 * a soft circle per point, never a pin — the data is a ~300 m cell, and the
 * drawing should not pretend to know more.
 */
export function AreaMap({
	centre,
	zoom = 13,
	points = [],
	you = null,
	pick = null,
	labels,
}: {
	centre: { lat: number; lng: number };
	zoom?: number;
	points?: MapPoint[];
	you?: { lat: number; lng: number } | null;
	pick?: {
		initial: { lat: number; lng: number } | null;
		/** Owned by the caller (AreaPicker): the pin follows it, taps go to onPick. */
		point?: { lat: number; lng: number } | null;
		onPick?: (point: { lat: number; lng: number }) => void;
	} | null;
	labels: {
		you: string;
		locate: string;
		located: string;
		locateFailed: string;
	};
}) {
	const element = useRef<HTMLDivElement>(null);
	const [picked, setPicked] = useState(pick?.initial ?? null);
	const [state, setState] = useState<"idle" | "ok" | "failed">(
		pick?.initial ? "ok" : "idle",
	);
	const markerRef = useRef<import("leaflet").CircleMarker | null>(null);
	const mapRef = useRef<import("leaflet").Map | null>(null);

	// A caller-owned pin (a typed neighbourhood, the device's location) moves here.
	const controlled = pick?.point;
	useEffect(() => {
		if (!controlled || !markerRef.current) return;
		markerRef.current
			.setLatLng([controlled.lat, controlled.lng])
			.setStyle({ opacity: 1, fillOpacity: 0.6 });
		mapRef.current?.panTo([controlled.lat, controlled.lng]);
	}, [controlled?.lat, controlled?.lng]);

	useEffect(() => {
		let map: import("leaflet").Map | undefined;
		let cancelled = false;

		void import("leaflet").then((L) => {
			if (cancelled || !element.current) return;
			map = L.map(element.current, { scrollWheelZoom: false }).setView(
				[pick?.initial?.lat ?? centre.lat, pick?.initial?.lng ?? centre.lng],
				zoom,
			);
			L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
				maxZoom: 18,
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			}).addTo(map);

			// The library's own colour, whichever it wears.
			const accent =
				getComputedStyle(document.documentElement)
					.getPropertyValue("--accent")
					.trim() || "#0b7361";
			const cell = 320; // metres: a little over the storage grid, so cells overlap kindly
			for (const point of points) {
				L.circle([point.lat, point.lng], {
					radius: cell,
					color: accent,
					weight: 1,
					fillOpacity: 0.18,
				})
					.addTo(map)
					.bindTooltip(point.label, { direction: "top" });
			}
			if (you) {
				L.circle([you.lat, you.lng], {
					radius: cell,
					color: "#98501f",
					weight: 1,
					fillOpacity: 0.18,
				})
					.addTo(map)
					.bindTooltip(labels.you, { direction: "top", permanent: true });
			}
			if (points.length || you) {
				const all = [...points, ...(you ? [you] : [])].map(
					(p) => [p.lat, p.lng] as [number, number],
				);
				map.fitBounds(L.latLngBounds(all).pad(0.4), { maxZoom: 15 });
			}

			if (pick) {
				const marker = L.circleMarker(
					[pick.initial?.lat ?? centre.lat, pick.initial?.lng ?? centre.lng],
					{ radius: 10, color: "#98501f", fillOpacity: 0.6 },
				).addTo(map);
				markerRef.current = marker;
				if (!pick.initial) marker.setStyle({ opacity: 0.3, fillOpacity: 0.15 });
				map.on("click", (event) => {
					marker
						.setLatLng(event.latlng)
						.setStyle({ opacity: 1, fillOpacity: 0.6 });
					const tapped = { lat: event.latlng.lat, lng: event.latlng.lng };
					if (pick.onPick) pick.onPick(tapped);
					else setPicked(tapped);
					setState("ok");
				});
				mapRef.current = map;
			}
		});

		return () => {
			cancelled = true;
			map?.remove();
		};
		// The map is built once; later prop changes are not expected on these pages.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function locate() {
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const point = { lat: coords.latitude, lng: coords.longitude };
				setPicked(point);
				setState("ok");
				markerRef.current
					?.setLatLng([point.lat, point.lng])
					.setStyle({ opacity: 1, fillOpacity: 0.6 });
			},
			() => setState("failed"),
			{ enableHighAccuracy: false, timeout: 10_000 },
		);
	}

	return (
		<div className="map-wrap">
			<div ref={element} className="map" />
			{pick && !pick.onPick ? (
				<>
					<input type="hidden" name="lat" value={picked?.lat ?? ""} />
					<input type="hidden" name="lng" value={picked?.lng ?? ""} />
					<p className="row">
						<button type="button" onClick={locate}>
							{labels.locate}
						</button>
						{state === "ok" ? (
							<span className="muted">{labels.located}</span>
						) : null}
						{state === "failed" ? (
							<span className="muted">{labels.locateFailed}</span>
						) : null}
					</p>
				</>
			) : null}
		</div>
	);
}
