/**
 * Pure crop geometry. A fixed frame (book-cover aspect) sits over an image the
 * member pans and zooms; the crop is whatever the frame shows. Kept free of
 * DOM so it can be reasoned about and, later, unit-tested.
 */

/** Book covers in this catalogue are 5:8 — matches the sample covers (500×790). */
export const COVER_ASPECT = 5 / 8;
export const OUTPUT_WIDTH = 600;
export const OUTPUT_HEIGHT = Math.round(OUTPUT_WIDTH / COVER_ASPECT);
export const MAX_ZOOM = 3;

export interface Size {
	width: number;
	height: number;
}

export interface View {
	/** Multiplier over the cover-fit scale; 1 = image just covers the frame. */
	zoom: number;
	/** Image top-left relative to the frame top-left, in frame pixels. */
	offsetX: number;
	offsetY: number;
}

export interface CropRect {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

/** Scale at which the image exactly covers the frame with no gaps. */
export function coverScale(image: Size, frame: Size): number {
	return Math.max(frame.width / image.width, frame.height / image.height);
}

/**
 * How far out a member may zoom. A book cover always fills its frame (1).
 * A thing's photo may be zoomed out until it fits whole inside the square,
 * and what the photo does not cover is filled: a tall photo becomes a square
 * with margins at its sides.
 */
export function minZoom(image: Size, frame: Size, pad = false): number {
	if (!pad) return 1;
	const contain = Math.min(
		frame.width / image.width,
		frame.height / image.height,
	);
	return Math.min(1, contain / coverScale(image, frame));
}

/**
 * Keeps the frame filled where the image is larger than it (no empty corners
 * after a drag), and the image inside the frame where it is smaller (padded).
 */
export function clamp(view: View, image: Size, frame: Size, pad = false): View {
	const zoom = Math.min(
		Math.max(view.zoom, minZoom(image, frame, pad)),
		MAX_ZOOM,
	);
	const scale = coverScale(image, frame) * zoom;
	const shownWidth = image.width * scale;
	const shownHeight = image.height * scale;
	const axis = (offset: number, shown: number, room: number) =>
		shown >= room
			? Math.min(0, Math.max(room - shown, offset))
			: Math.max(0, Math.min(room - shown, offset));
	return {
		zoom,
		offsetX: axis(view.offsetX, shownWidth, frame.width),
		offsetY: axis(view.offsetY, shownHeight, frame.height),
	};
}

/** Centre the image in the frame at zoom 1 — the starting point. */
export function centred(image: Size, frame: Size): View {
	const scale = coverScale(image, frame);
	return clamp(
		{
			zoom: 1,
			offsetX: (frame.width - image.width * scale) / 2,
			offsetY: (frame.height - image.height * scale) / 2,
		},
		image,
		frame,
	);
}

/** Change zoom while keeping the frame centre fixed on the same image point. */
export function zoomed(
	view: View,
	zoom: number,
	image: Size,
	frame: Size,
	pad = false,
): View {
	const before = coverScale(image, frame) * view.zoom;
	const next = clamp({ ...view, zoom }, image, frame, pad);
	const after = coverScale(image, frame) * next.zoom;
	const centreX = frame.width / 2;
	const centreY = frame.height / 2;
	const imageX = (centreX - view.offsetX) / before;
	const imageY = (centreY - view.offsetY) / before;
	return clamp(
		{
			zoom: next.zoom,
			offsetX: centreX - imageX * after,
			offsetY: centreY - imageY * after,
		},
		image,
		frame,
		pad,
	);
}

/** How far an arrow key moves the picture in its frame, in CSS pixels. */
const NUDGE = 8;

/**
 * The picture moved by an arrow key, for somebody placing it without a
 * pointer: further with Shift. Null for any other key. Clamped as a drag is.
 */
export function nudged(
	view: View,
	key: string,
	far: boolean,
	image: Size,
	frame: Size,
	pad = false,
): View | null {
	const step = far ? NUDGE * 4 : NUDGE;
	const move = (
		{
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step],
		} as Record<string, [number, number]>
	)[key];
	if (!move) return null;
	return clamp(
		{
			...view,
			offsetX: view.offsetX + move[0],
			offsetY: view.offsetY + move[1],
		},
		image,
		frame,
		pad,
	);
}

/** The source rectangle, in image pixels, that the frame currently shows. */
export function cropRect(view: View, image: Size, frame: Size): CropRect {
	const scale = coverScale(image, frame) * view.zoom;
	return {
		sx: -view.offsetX / scale,
		sy: -view.offsetY / scale,
		sw: frame.width / scale,
		sh: frame.height / scale,
	};
}

/**
 * Paint what the frame shows onto a canvas of any size: the fill first, then
 * the whole image where the view puts it. The canvas clips the rest, so a
 * padded view (image smaller than the frame) and a cropped one draw alike.
 */
export function paint(
	context: CanvasRenderingContext2D,
	image: CanvasImageSource & Size,
	view: View,
	frame: Size,
	width: number,
	height: number,
	fill = "#ffffff",
): void {
	const k = width / frame.width;
	const scale = coverScale(image, frame) * view.zoom;
	context.fillStyle = fill;
	context.fillRect(0, 0, width, height);
	context.drawImage(
		image,
		view.offsetX * k,
		view.offsetY * k,
		image.width * scale * k,
		image.height * scale * k,
	);
}
