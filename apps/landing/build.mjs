#!/usr/bin/env node
// Copies site/ to dist/ and inlines the icons: every <svg data-icon="name">
// in a page gets the Phosphor glyph of that name inside it, so each page
// ships as one HTML file with no icon requests and no script. Each page gets
// a Markdown twin, and the sitemap gets its dates.
import { execFileSync } from "node:child_process";
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
import { NodeHtmlMarkdown } from "node-html-markdown";

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

// Each page again as Markdown, for an agent that asks for it (worker.js):
// what the page says, without the navigation, the icons or the styling.
// Links made absolute, so they still lead somewhere once copied out.
const markdown = (html) => {
	const meta = (pattern) => pattern.exec(html)?.[1].replace(/\s+/g, " ").trim();
	const title = meta(/<title>([^<]*)<\/title>/);
	const description = meta(/<meta\s+name="description"\s+content="([^"]*)"/);
	const url = meta(/<link\s+rel="canonical"\s+href="([^"]*)"/);
	const origin = new URL(url).origin;
	const content = /<main>([\s\S]*)<\/main>[\s\S]*<footer>([\s\S]*)<\/footer>/
		.exec(html)
		.slice(1)
		.join("<hr />")
		.replace(/<svg[\s\S]*?<\/svg>/g, "")
		.replace(/<source[^>]*>/g, "")
		.replace(/(href|src)="\/(?!\/)/g, `$1="${origin}/`);
	const front = [
		"---",
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description)}`,
		`url: ${url}`,
		"---",
	].join("\n");
	return `${front}\n\n${NodeHtmlMarkdown.translate(content)}\n`;
};

// Every page: the stylesheet by its stamped name, and its icons inlined.
for (const page of readdirSync(site).filter((name) => name.endsWith(".html"))) {
	const html = restyled(readFileSync(`${site}/${page}`, "utf8")).replace(
		/<svg data-icon="([a-z-]+)"([^>]*)><\/svg>/g,
		(_, name, attrs) =>
			`<svg${attrs} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${glyph(name)}</svg>`,
	);
	writeFileSync(`${dist}/${page}`, html);
	if (page !== "404.html") {
		writeFileSync(`${dist}/${page.replace(/\.html$/, ".md")}`, markdown(html));
	}
}

// The sitemap's dates, from each page's last commit, so they are never left
// behind. A search engine stops trusting dates that are wrong; with no git
// history to ask (a copy without .git), a page goes without one.
const changed = (page) => {
	try {
		return execFileSync(
			"git",
			["log", "-1", "--format=%cs", "--", `site/${page}`],
			{ cwd: here, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		).trim();
	} catch {
		return "";
	}
};
const sitemap = readFileSync(`${site}/sitemap.xml`, "utf8").replace(
	/(\s*)<loc>https:\/\/[^/]+\/([^<]*)<\/loc>/g,
	(loc, indent, path) => {
		const date = changed(`${path || "index"}.html`);
		return date ? `${loc}${indent}<lastmod>${date}</lastmod>` : loc;
	},
);
writeFileSync(`${dist}/sitemap.xml`, sitemap);
console.log("built dist/");
