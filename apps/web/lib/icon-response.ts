import { Accent } from "@cdl/contracts";
import { brandColours } from "./accent.ts";
import { appIconPng, appIconSvg, faviconIco, faviconSvg } from "./icon.ts";
import { library } from "./library.ts";

export type IconName =
	| "icon.svg"
	| "favicon.svg"
	| "favicon.ico"
	| "icon-192.png"
	| "icon-512.png"
	| "apple-touch-icon.png";

const TYPES = {
	svg: "image/svg+xml",
	png: "image/png",
	ico: "image/x-icon",
} as const;

/** Drawn once per colour in an isolate: a notification burst asks many times. */
const made = new Map<string, string | Uint8Array<ArrayBuffer>>();

/**
 * One of the library's icons, in its colour. The same addresses the static
 * files had, so the manifest, the tab, notifications and the MCP server's
 * logo all follow the colour without knowing it changed.
 */
export async function icon(
	name: IconName,
	request: Request,
): Promise<Response> {
	// An address carrying a colour (iconHref) is drawn in that colour, so what
	// it serves never changes and can be kept for good; another isolate's
	// minute-old idea of the library's colour cannot creep in under it.
	const given = Accent.safeParse(
		`#${new URL(request.url).searchParams.get("v") ?? ""}`,
	);
	const accent = given.success ? given.data : (await library()).accent;
	const { light, dark } = brandColours(accent);
	const key = `${name}:${light}:${dark}`;
	let body = made.get(key);
	if (body === undefined) {
		body = await draw(name, light, dark);
		if (made.size > 24) made.clear();
		made.set(key, body);
	}
	const extension = name.slice(name.lastIndexOf(".") + 1) as keyof typeof TYPES;
	return new Response(body, {
		headers: {
			"content-type": TYPES[extension],
			"cache-control": given.success
				? "public, max-age=31536000, immutable"
				: "public, max-age=3600",
		},
	});
}

function draw(
	name: IconName,
	light: string,
	dark: string,
): Promise<string | Uint8Array<ArrayBuffer>> | string {
	switch (name) {
		case "icon.svg":
			return appIconSvg(light);
		case "favicon.svg":
			return faviconSvg(light, dark);
		case "favicon.ico":
			return faviconIco(light);
		case "icon-192.png":
			return appIconPng(192, light);
		case "icon-512.png":
			return appIconPng(512, light);
		case "apple-touch-icon.png":
			return appIconPng(180, light);
	}
}
