import { env } from "cloudflare:workers";

const vars = env as unknown as {
	APP_URL?: string;
	MCP_URL?: string;
	IMAGES_URL?: string;
};
const development = process.env.NODE_ENV !== "production";

/** This app's public origin, for absolute links (share, OG tags). */
export function appBase(): string {
	return development ? "http://localhost:3000" : (vars.APP_URL ?? "");
}

/** The library's MCP server's origin, without a trailing slash. */
export function mcpBase(): string {
	return (vars.MCP_URL ?? (development ? "http://localhost:8788" : "")).replace(
		/\/$/,
		"",
	);
}

/** The origin the covers come from, when it is not this site's own. */
export function imagesOrigin(): string | null {
	if (!vars.IMAGES_URL) return null;
	try {
		const origin = new URL(vars.IMAGES_URL).origin;
		const own = appBase() ? new URL(appBase()).origin : null;
		return origin === own ? null : origin;
	} catch {
		return null;
	}
}
