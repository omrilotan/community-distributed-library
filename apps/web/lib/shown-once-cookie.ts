/**
 * The cookie that carries a secret shown once to a browser without scripts
 * (lib/shown-once.ts reads it). Kept apart from that module so middleware
 * can name it without pulling in what only pages may use.
 */
export const SHOWN_ONCE_COOKIE = "__Host-shown-once";
/** How middleware hands it to the one page view that shows it. */
export const SHOWN_ONCE_HEADER = "x-cdl-shown-once";

/** What each kind of secret shown once carries. */
export interface ShownOnceKinds {
	/** A member's link to one neighbour. */
	invite: { url: string; expiresAt: number };
	/** A moderator's link for a batch. */
	"batch-invite": { url: string; expiresAt: number };
	/** A sign-in link for the member's other device. */
	"device-link": { url: string; expiresAt: number };
	/** A personal token. */
	token: { secret: string };
	/** The secret a webhook's deliveries are signed with. */
	"webhook-secret": { secret: string };
}

export type ShownOnce = {
	[Kind in keyof ShownOnceKinds]: { kind: Kind } & ShownOnceKinds[Kind];
}[keyof ShownOnceKinds];

export function shownOnceCookie(value: ShownOnce): string {
	const encoded = encodeURIComponent(JSON.stringify(value));
	return `${SHOWN_ONCE_COOKIE}=${encoded}; Path=/; Max-Age=120; HttpOnly; Secure; SameSite=Lax`;
}

/** A form sent by the browser itself, rather than a script asking for JSON. */
export function fromAForm(request: Request): boolean {
	return (request.headers.get("accept") ?? "").includes("text/html");
}

/** Back to a page, as a browser posting a form expects, perhaps with a secret to show once. */
export function seeOther(location: string, secret?: ShownOnce): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location,
			...(secret ? { "set-cookie": shownOnceCookie(secret) } : {}),
		},
	});
}
