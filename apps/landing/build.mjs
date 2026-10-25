#!/usr/bin/env node
// Copies site/ to dist/ and inlines the icons: every <svg data-icon="name">
// in a page gets the Phosphor glyph of that name inside it, so each page
// ships as one HTML file with no icon requests and no script.
import { createHash } from "node:crypto";
import {
	cpSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = fileURLToPath(new URL(".", import.meta.url));
const site = `${here}site`;
const dist = `${here}dist`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
cpSync(site, dist, { recursive: true });

// The stylesheet, named after its contents: a browser keeps it for good, and
// a change is a new name (_headers: /styles/*). The plain /styles.css stays
// for a page fetched before the deploy.
const styles = readFileSync(`${site}/styles.css`);
const stamp = createHash("sha256").update(styles).digest("hex").slice(0, 8);
mkdirSync(`${dist}/styles`);
writeFileSync(`${dist}/styles/${stamp}.css`, styles);
const restyled = (html) =>
	html.replaceAll('href="/styles.css"', `href="/styles/${stamp}.css"`);

const glyph = (name) => {
	const file = require.resolve(
		`@phosphor-icons/core/assets/regular/${name}.svg`,
	);
	const svg = readFileSync(file, "utf8");
	// Keep the paths, drop Phosphor's own <svg> wrapper: ours carries the size.
	return svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
};

// Every page: the stylesheet by its stamped name, and its icons inlined.
for (const page of readdirSync(site).filter((name) => name.endsWith(".html"))) {
	const html = restyled(readFileSync(`${site}/${page}`, "utf8")).replace(
		/<svg data-icon="([a-z-]+)"([^>]*)><\/svg>/g,
		(_, name, attrs) =>
			`<svg${attrs} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${glyph(name)}</svg>`,
	);
	writeFileSync(`${dist}/${page}`, html);
}
console.log("built dist/");
