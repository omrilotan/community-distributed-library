/**
 * Render the explainer, both shapes, into out/.
 *
 * Usage:
 *   npm run render                         both videos, out/explainer-<shape>.mp4
 *   npm run render -- --stills 2,9.5,30    stills at those seconds, out/stills/
 *   npm run render -- --only portrait      one shape
 */
import { bundle } from "@remotion/bundler";
import {
	renderMedia,
	renderStill,
	selectComposition,
} from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: { stills: { type: "string" }, only: { type: "string" } },
});
const root = new URL("..", import.meta.url).pathname;
const shapes = values.only ? [values.only] : ["landscape", "portrait"];

const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts") });
// Away from 3000, where a Remotion Studio of another project may be running.
const port = 3110;
for (const shape of shapes) {
	const id = `explainer-${shape}`;
	const composition = await selectComposition({
		serveUrl,
		id,
		inputProps: { shape },
		port,
	});
	if (values.stills) {
		mkdirSync(join(root, "out", "stills"), { recursive: true });
		for (const second of values.stills.split(",").map(Number)) {
			const frame = Math.min(
				composition.durationInFrames - 1,
				Math.round(second * composition.fps),
			);
			const output = join(root, "out", "stills", `${shape}-${second}.png`);
			await renderStill({
				serveUrl,
				composition,
				frame,
				output,
				inputProps: { shape },
				port,
			});
			console.log(output);
		}
		continue;
	}
	const output = join(root, "out", `${id}.mp4`);
	await renderMedia({
		serveUrl,
		composition,
		codec: "h264",
		crf: 18,
		audioBitrate: "192k",
		outputLocation: output,
		inputProps: { shape },
		port,
		onProgress: ({ progress }) =>
			process.stdout.write(`\r${id} ${Math.round(progress * 100)}%`),
	});
	console.log(`\n${output}`);
}
