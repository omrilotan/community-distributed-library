"use client";

import { useEffect, useRef, useState } from "react";
import {
	COVER_ASPECT,
	MAX_ZOOM,
	OUTPUT_HEIGHT,
	OUTPUT_WIDTH,
	centred,
	clamp,
	cropRect,
	nudged,
	zoomed,
	type Size,
	type View,
} from "../../../lib/crop.ts";

export interface CoverPickerLabels {
	choose: string;
	change: string;
	remove: string;
	zoom: string;
	hint: string;
}

/**
 * The member picks an image, pans and zooms it under a fixed cover-shaped
 * frame, and the form submits only what the frame shows, re-encoded as a
 * 600×960 JPEG. The original file, and whatever metadata it carries, is never sent.
 *
 * The real `cover` file input exists only here, so without JavaScript no
 * cover can be attached — by design, not by accident.
 */
export function CoverPicker({ labels }: { labels: CoverPickerLabels }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const [image, setImage] = useState<ImageBitmap | null>(null);
	const [view, setView] = useState<View>({ zoom: 1, offsetX: 0, offsetY: 0 });
	const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
	const drag = useRef<{
		x: number;
		y: number;
		offsetX: number;
		offsetY: number;
	} | null>(null);

	// Frame follows the canvas element's laid-out width; height follows the aspect.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width ?? 0;
			setFrame({ width, height: width / COVER_ASPECT });
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (image && frame.width)
			setView((current) => clamp(current, image, frame));
	}, [image, frame]);

	// Redraw whenever anything moves.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !image || !frame.width) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(frame.width * ratio);
		canvas.height = Math.round(frame.height * ratio);
		const context = canvas.getContext("2d");
		if (!context) return;
		const { sx, sy, sw, sh } = cropRect(view, image, frame);
		context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
	}, [image, view, frame]);

	// On submit, replace the hidden input's file with the rendered crop.
	useEffect(() => {
		const input = fileRef.current;
		const form = input?.form;
		if (!input || !form) return;
		let ready = false;

		const onSubmit = (event: SubmitEvent) => {
			if (ready || !image) return;
			event.preventDefault();
			const output = document.createElement("canvas");
			output.width = OUTPUT_WIDTH;
			output.height = OUTPUT_HEIGHT;
			const { sx, sy, sw, sh } = cropRect(view, image, frame);
			output
				.getContext("2d")
				?.drawImage(image, sx, sy, sw, sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
			output.toBlob(
				(blob) => {
					if (blob) {
						const transfer = new DataTransfer();
						transfer.items.add(
							new File([blob], "cover.jpg", { type: "image/jpeg" }),
						);
						input.files = transfer.files;
					}
					ready = true;
					form.requestSubmit();
				},
				"image/jpeg",
				0.85,
			);
		};

		form.addEventListener("submit", onSubmit);
		return () => form.removeEventListener("submit", onSubmit);
	}, [image, view, frame]);

	async function choose(file: File | undefined) {
		image?.close();
		if (!file) return setImage(null);
		// Honour EXIF orientation where the browser supports it; fall back otherwise.
		const bitmap = await createImageBitmap(file, {
			imageOrientation: "from-image",
		}).catch(() => createImageBitmap(file));
		setImage(bitmap);
		setView(centred(bitmap, frame));
	}

	function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
		if (!image) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { x: event.clientX, y: event.clientY, ...view };
	}

	function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
		const start = drag.current;
		if (!start || !image) return;
		setView(
			clamp(
				{
					zoom: view.zoom,
					offsetX: start.offsetX + (event.clientX - start.x),
					offsetY: start.offsetY + (event.clientY - start.y),
				},
				image,
				frame,
			),
		);
	}

	function onPointerUp() {
		drag.current = null;
	}

	return (
		<div className="picker">
			<label className="picker-choose">
				<input
					type="file"
					accept="image/*"
					onChange={(event) => void choose(event.target.files?.[0])}
				/>
				<span>{image ? labels.change : labels.choose}</span>
			</label>

			{/* Submitted field. Filled with the crop on submit, never with the chosen file. */}
			<input ref={fileRef} type="file" name="cover" hidden tabIndex={-1} />

			<canvas
				ref={canvasRef}
				className="picker-frame"
				hidden={!image}
				aria-label={labels.hint}
				// The arrow keys place it as a drag does.
				tabIndex={image ? 0 : -1}
				onKeyDown={(event) => {
					if (!image) return;
					const next = nudged(view, event.key, event.shiftKey, image, frame);
					if (!next) return;
					event.preventDefault();
					setView(next);
				}}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			/>

			{image ? (
				<>
					<p className="muted">{labels.hint}</p>
					<label>
						{labels.zoom}
						<input
							type="range"
							min={1}
							max={MAX_ZOOM}
							step={0.01}
							value={view.zoom}
							onChange={(event) =>
								setView(zoomed(view, Number(event.target.value), image, frame))
							}
						/>
					</label>
					<button
						type="button"
						className="picker-remove"
						onClick={() => void choose(undefined)}
					>
						{labels.remove}
					</button>
				</>
			) : null}
		</div>
	);
}
