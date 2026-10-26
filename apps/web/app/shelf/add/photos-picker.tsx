"use client";

import { useEffect, useRef, useState } from "react";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise";
import { MagnifyingGlassMinus } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassMinus";
import { MagnifyingGlassPlus } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassPlus";
import {
	MAX_ZOOM,
	clamp,
	coverScale,
	minZoom,
	nudged,
	paint,
	zoomed,
	type Size,
	type View,
} from "../../../lib/crop.ts";

export interface PhotosPickerLabels {
	add: string;
	remove: string;
	zoom: string;
	hint: string;
	main: string;
	/** On a photo the thing already has and the owner took out: put it back. */
	keep: string;
	/** Moving a photo one place towards the first, and away from it. */
	earlier: string;
	later: string;
	/** "No room…", "One more…", and many with {n} for the count. Strings, not a function: they cross from the server. */
	room: { none: string; one: string; many: string };
}

/** How finely the zoom slider moves, from whole-photo to closest. */
const ZOOM_STEPS = 100;
/** A thing's photos are square, and sent at this size. */
const OUTPUT = 1000;
/** What fills the square where a photo does not reach: plain white. */
const FILL = "#ffffff";

type Render = () => Promise<Blob | null>;

/**
 * Up to `max` square photos of a thing, each panned and zoomed in its own
 * frame. A photo that is not square can be zoomed out until it fits whole,
 * and the square is filled around it, so nothing has to be cut off. The form
 * submits only the squares, re-encoded as JPEG, in the order shown: the first
 * is the thing's picture everywhere. The original files are never sent.
 */
export function PhotosPicker({
	labels,
	max,
	name = "photos",
	kept = [],
}: {
	labels: PhotosPickerLabels;
	/** How many photos a thing may have in all, those it has included. */
	max: number;
	name?: string;
	/**
	 * The photos the thing already has, on its own page: shown first in the
	 * same row, each sent as `keep` while it stays. One taken out is dimmed
	 * where it was, so it can be put back.
	 */
	kept?: string[];
}) {
	// Every photo in the order shown: those the thing has, then new ones,
	// moved about as the owner likes. The first is the main photo.
	const [slots, setSlots] = useState<Slot[]>(() =>
		kept.map((url) => ({
			kind: "kept",
			key: `kept:${url}`,
			url,
			dropped: false,
		})),
	);
	const fileRef = useRef<HTMLInputElement>(null);
	const renders = useRef(new Map<number, Render>());
	const next = useRef(0);
	const added = slots.filter((slot) => slot.kind === "new");
	// The photos that will be saved; one taken out makes room for another.
	const live = slots.filter((slot) => slot.kind === "new" || !slot.dropped);

	// On submit, replace the hidden input's files with the rendered squares.
	useEffect(() => {
		const input = fileRef.current;
		const form = input?.form;
		if (!input || !form) return;
		let ready = false;
		const onSubmit = (event: SubmitEvent) => {
			if (ready || added.length === 0) return;
			event.preventDefault();
			void (async () => {
				const transfer = new DataTransfer();
				for (const [index, photo] of added.entries()) {
					const blob = await renders.current.get(photo.id)?.();
					if (blob)
						transfer.items.add(
							new File([blob], `photo-${index + 1}.jpg`, {
								type: "image/jpeg",
							}),
						);
				}
				input.files = transfer.files;
				ready = true;
				form.requestSubmit();
			})();
		};
		form.addEventListener("submit", onSubmit);
		return () => form.removeEventListener("submit", onSubmit);
	}, [added]);

	async function add(files: FileList | null) {
		const room = max - live.length;
		const chosen = Array.from(files ?? []).slice(0, Math.max(0, room));
		const fresh = await Promise.all(
			chosen.map(async (file): Promise<Slot> => {
				const id = next.current++;
				return {
					kind: "new",
					key: `new:${id}`,
					id,
					// Honour EXIF orientation where the browser supports it.
					image: await createImageBitmap(file, {
						imageOrientation: "from-image",
					}).catch(() => createImageBitmap(file)),
				};
			}),
		);
		setSlots((current) => [...current, ...fresh]);
	}

	/** Take a photo the thing has out of the row, or put it back. */
	function drop(key: string, dropped: boolean) {
		setSlots((current) =>
			current.map((slot) =>
				slot.kind === "kept" && slot.key === key ? { ...slot, dropped } : slot,
			),
		);
	}

	function remove(id: number) {
		setSlots((current) => {
			const gone = current.find(
				(slot) => slot.kind === "new" && slot.id === id,
			);
			if (gone?.kind === "new") gone.image.close();
			return current.filter((slot) => slot !== gone);
		});
		renders.current.delete(id);
	}

	function move(index: number, by: -1 | 1) {
		setSlots((current) => {
			const to = index + by;
			if (to < 0 || to >= current.length) return current;
			const moved = [...current];
			[moved[index], moved[to]] = [moved[to]!, moved[index]!];
			return moved;
		});
	}

	// Which photo goes where: a kept one by its address, a new one by its
	// place among the files sent, split by spaces (a form turns line breaks
	// into CRLF; an address has no spaces). The server keeps this order.
	const order = live
		.map((slot) =>
			slot.kind === "kept" ? `kept:${slot.url}` : `new:${added.indexOf(slot)}`,
		)
		.join(" ");
	const left = max - live.length;
	// The first photo that stays is the thing's picture everywhere.
	const main = live[0]?.key;
	return (
		<div className="photos-picker">
			{/* Submitted field: filled with the squares on submit, never with the chosen files. */}
			<input
				ref={fileRef}
				type="file"
				name={name}
				multiple
				hidden
				tabIndex={-1}
			/>
			<input type="hidden" name="order" value={order} />
			<ol className="photos-slots">
				{slots.map((slot, index) => {
					const out = slot.kind === "kept" && slot.dropped;
					// What acts on the photo, laid over it: which is the main one,
					// take it out (or put it back), move it a place either way.
					const overlay = (
						<>
							{slot.key === main ? (
								<span className="badge photos-main">{labels.main}</span>
							) : null}
							{out ? (
								<button
									type="button"
									className="photos-undo"
									disabled={left === 0}
									onClick={() => drop(slot.key, false)}
								>
									<ArrowCounterClockwise
										size={16}
										weight="bold"
										aria-hidden="true"
									/>
									{labels.keep}
								</button>
							) : (
								<button
									type="button"
									className="photos-act photos-remove"
									aria-label={labels.remove}
									title={labels.remove}
									onClick={() =>
										slot.kind === "kept"
											? drop(slot.key, true)
											: remove(slot.id)
									}
								>
									<X size={16} weight="bold" aria-hidden="true" />
								</button>
							)}
							{slots.length > 1 && !out ? (
								<div className="photos-move">
									{/* Only the moves there are: none earlier for the first. */}
									{index > 0 ? (
										<button
											type="button"
											className="photos-act"
											aria-label={labels.earlier}
											title={labels.earlier}
											onClick={() => move(index, -1)}
										>
											<CaretLeft
												className="icon-directional"
												size={16}
												weight="bold"
												aria-hidden="true"
											/>
										</button>
									) : (
										<span />
									)}
									{index < slots.length - 1 ? (
										<button
											type="button"
											className="photos-act"
											aria-label={labels.later}
											title={labels.later}
											onClick={() => move(index, 1)}
										>
											<CaretRight
												className="icon-directional"
												size={16}
												weight="bold"
												aria-hidden="true"
											/>
										</button>
									) : null}
								</div>
							) : null}
						</>
					);
					return (
						<li key={slot.key} className={out ? "photos-out" : undefined}>
							{slot.kind === "kept" ? (
								<div className="photos-frame">
									<img alt="" src={slot.url} className="picker-square" />
									{out ? null : (
										<input type="hidden" name="keep" value={slot.url} />
									)}
									{overlay}
								</div>
							) : (
								<Square
									image={slot.image}
									labels={labels}
									register={(render) => renders.current.set(slot.id, render)}
								>
									{overlay}
								</Square>
							)}
						</li>
					);
				})}
				{/* The way to add more sits where the next photo would go. */}
				{left > 0 ? (
					<li>
						<label className="photos-add picker-square">
							<input
								type="file"
								accept="image/*"
								multiple
								onChange={(event) => {
									void add(event.target.files);
									event.target.value = "";
								}}
							/>
							<Plus size={22} weight="bold" aria-hidden="true" />
							<span>{labels.add}</span>
						</label>
					</li>
				) : null}
			</ol>
			<p className="muted" role="status">
				{added.length ? `${labels.hint} ` : ""}
				{left === 0
					? labels.room.none
					: left === 1
						? labels.room.one
						: labels.room.many.replace("{n}", String(left))}
			</p>
		</div>
	);
}

/** A photo in the row: one the thing already has, or one just chosen. */
type Slot =
	| { kind: "kept"; key: string; url: string; dropped: boolean }
	| { kind: "new"; key: string; id: number; image: ImageBitmap };

/** One photo in its square: drag to move it, zoom out to see it whole. */
function Square({
	image,
	labels,
	register,
	children,
}: {
	image: ImageBitmap;
	labels: PhotosPickerLabels;
	register: (render: Render) => void;
	/** What is laid over the photo: its badge and buttons. */
	children: React.ReactNode;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
	const [view, setView] = useState<View | null>(null);
	const drag = useRef<{ x: number; y: number; view: View } | null>(null);
	// As far out as this photo may go: whole inside its square.
	const lowest = frame.width ? minZoom(image, frame, true) : 1;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width ?? 0;
			setFrame({ width, height: width });
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	// Start with the whole photo in view, centred, padded where it is not square.
	useEffect(() => {
		if (!frame.width) return;
		setView((current) => {
			if (current) return clamp(current, image, frame, true);
			const zoom = minZoom(image, frame, true);
			const scale = coverScale(image, frame) * zoom;
			return clamp(
				{
					zoom,
					offsetX: (frame.width - image.width * scale) / 2,
					offsetY: (frame.height - image.height * scale) / 2,
				},
				image,
				frame,
				true,
			);
		});
	}, [image, frame]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !view || !frame.width) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(frame.width * ratio);
		canvas.height = Math.round(frame.height * ratio);
		const context = canvas.getContext("2d");
		if (context)
			paint(context, image, view, frame, canvas.width, canvas.height, FILL);
	}, [image, view, frame]);

	useEffect(() => {
		register(
			() =>
				new Promise((resolve) => {
					if (!view || !frame.width) return resolve(null);
					const output = document.createElement("canvas");
					output.width = OUTPUT;
					output.height = OUTPUT;
					const context = output.getContext("2d");
					if (!context) return resolve(null);
					paint(context, image, view, frame, OUTPUT, OUTPUT, FILL);
					output.toBlob(resolve, "image/jpeg", 0.85);
				}),
		);
	}, [image, view, frame, register]);

	return (
		<>
			<div className="photos-frame">
				<canvas
					ref={canvasRef}
					className="picker-frame picker-square"
					aria-label={labels.hint}
					// The arrow keys place it as a drag does.
					tabIndex={0}
					onKeyDown={(event) => {
						if (!view) return;
						const next = nudged(
							view,
							event.key,
							event.shiftKey,
							image,
							frame,
							true,
						);
						if (!next) return;
						event.preventDefault();
						setView(next);
					}}
					onPointerDown={(event) => {
						if (!view) return;
						event.currentTarget.setPointerCapture(event.pointerId);
						drag.current = { x: event.clientX, y: event.clientY, view };
					}}
					onPointerMove={(event) => {
						const start = drag.current;
						if (!start) return;
						setView(
							clamp(
								{
									zoom: start.view.zoom,
									offsetX: start.view.offsetX + (event.clientX - start.x),
									offsetY: start.view.offsetY + (event.clientY - start.y),
								},
								image,
								frame,
								true,
							),
						);
					}}
					onPointerUp={() => {
						drag.current = null;
					}}
					onPointerCancel={() => {
						drag.current = null;
					}}
				/>
				{children}
			</div>
			{view ? (
				<label className="photos-zoom">
					<span className="sr-only">{labels.zoom}</span>
					<MagnifyingGlassMinus size={16} aria-hidden="true" />
					{/* A whole-number scale over the zoom range: a fractional minimum
					    (0.952…) on the input itself fails the form's own check on
					    Save. No name, so it is never sent. */}
					<input
						type="range"
						min={0}
						max={ZOOM_STEPS}
						step={1}
						value={Math.round(
							((view.zoom - lowest) / (MAX_ZOOM - lowest)) * ZOOM_STEPS,
						)}
						onChange={(event) =>
							setView(
								zoomed(
									view,
									lowest +
										(Number(event.target.value) / ZOOM_STEPS) *
											(MAX_ZOOM - lowest),
									image,
									frame,
									true,
								),
							)
						}
					/>
					<MagnifyingGlassPlus size={16} aria-hidden="true" />
				</label>
			) : null}
		</>
	);
}
