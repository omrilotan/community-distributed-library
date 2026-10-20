import { env } from "cloudflare:workers";

const vars = env as unknown as {
	APP_URL?: string;
	MCP_URL?: string;
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
