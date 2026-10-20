#!/usr/bin/env node
// Copies site/ to dist/ and inlines the icons: every <svg data-icon="name">
// in the HTML gets the Phosphor glyph of that name inside it, so the page
// ships one HTML file with no icon requests and no script.
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = new URL(".", import.meta.url).pathname;
const site = `${here}site`;
const dist = `${here}dist`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
cpSync(site, dist, { recursive: true });

const glyph = (name) => {
	const file = require.resolve(
		`@phosphor-icons/core/assets/regular/${name}.svg`,
	);
	const svg = readFileSync(file, "utf8");
	// Keep the paths, drop Phosphor's own <svg> wrapper: ours carries the size.
	return svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
};

const html = readFileSync(`${site}/index.html`, "utf8").replace(
	/<svg data-icon="([a-z-]+)"([^>]*)><\/svg>/g,
	(_, name, attrs) =>
		`<svg${attrs} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${glyph(name)}</svg>`,
);
writeFileSync(`${dist}/index.html`, html);
console.log("built dist/");
