import { headers } from "next/headers";
import { SHOWN_ONCE_HEADER, type ShownOnceKinds } from "./shown-once-cookie.ts";

/**
 * A secret shown once to a browser without scripts: an invitation or sign-in
 * link, a personal token, a webhook's secret. Only a hash of each is kept,
 * if anything. The form posts, the handler makes the secret and sends it on
 * in a cookie that lasts two minutes, never in an address (where history and
 * logs would keep it). Middleware hands it to the next page view and clears
 * the cookie, so it is shown once.
 */
export async function shownOnce<Kind extends keyof ShownOnceKinds>(
	kind: Kind,
): Promise<({ kind: Kind } & ShownOnceKinds[Kind]) | null> {
	const raw = (await headers()).get(SHOWN_ONCE_HEADER);
	if (!raw) return null;
	try {
		const value: unknown = JSON.parse(decodeURIComponent(raw));
		return isShown(value, kind) ? value : null;
	} catch {
		return null;
	}
}

/** The kind asked for, carrying its link or its secret. */
function isShown<Kind extends keyof ShownOnceKinds>(
	value: unknown,
	kind: Kind,
): value is { kind: Kind } & ShownOnceKinds[Kind] {
	if (typeof value !== "object" || value === null) return false;
	const shown = value as Partial<Record<"kind" | "url" | "secret", unknown>>;
	return (
		shown.kind === kind &&
		(typeof shown.url === "string" || typeof shown.secret === "string")
	);
}
