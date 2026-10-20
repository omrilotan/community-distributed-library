import type { LibraryType } from "@cdl/contracts";
import type { Env } from "./env.ts";

/** What the server needs to know about its library: its name and what it lends. */
export interface LibraryInfo {
	name: string;
	type: LibraryType;
}

const UNKNOWN: LibraryInfo = { name: "Neighbourhood library", type: "books" };

/**
 * As core tells any visitor, for the server's title, its plain-text front
 * door and the tools it offers. Kept for a minute per isolate; core not
 * answering leaves a plain description rather than another library's name.
 */
const TTL_MS = 60_000;
let known: { value: LibraryInfo; until: number } | null = null;

export async function libraryInfo(env: Env): Promise<LibraryInfo> {
	if (known && known.until > Date.now()) return known.value;
	try {
		const response = await env.CORE.fetch(
			new Request("http://core/v1/community", {
				headers: { accept: "application/json" },
			}),
		);
		if (!response.ok) return UNKNOWN;
		const body = (await response.json()) as Partial<LibraryInfo>;
		if (!body.name) return UNKNOWN;
		const value: LibraryInfo = {
			name: body.name,
			type: body.type === "things" ? "things" : "books",
		};
		known = { value, until: Date.now() + TTL_MS };
		return value;
	} catch {
		return UNKNOWN;
	}
}

export async function libraryName(env: Env): Promise<string> {
	return (await libraryInfo(env)).name;
}
