import { cookies } from "next/headers";
import type { Session } from "@cdl/contracts";
import { backAfterSignIn } from "./safe-path.ts";
import { sessionCookie } from "./session.ts";

/**
 * What a browser keeps while it waits for a sign-in email. The `__Host-`
 * prefix, as on the session cookie: Secure, this hostname alone, and no
 * sibling subdomain can plant one.
 *
 * BROWSER is a random value core binds the email's code to, so the code
 * signs in this browser and no other. BACK is where to go once signed in,
 * such as an assistant's consent screen.
 */
const BROWSER = "__Host-sign-in";
const BACK = "__Host-sign-in-back";
/** Longer than a link lives (15 minutes), so the code outlasts the wait for it. */
const MAX_AGE = 30 * 60;

/** This browser's value, or null when it never asked or the cookie is not one of ours. */
export async function signInBrowser(): Promise<string | null> {
	const value = (await cookies()).get(BROWSER)?.value ?? "";
	return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

/** A fresh value: 32 random bytes, base64url. */
export function newSignInBrowser(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Where to go after signing in, checked again on the way out. */
export async function signInBack(): Promise<string | null> {
	// Read back already decoded; checked again all the same.
	return backAfterSignIn((await cookies()).get(BACK)?.value);
}

/** Set-Cookie values for a browser that has just asked for a link. */
export function signInCookies(browser: string, back: string | null): string[] {
	const flags = `Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
	return [
		`${BROWSER}=${browser}; ${flags}`,
		back
			? `${BACK}=${encodeURIComponent(back)}; ${flags}`
			: `${BACK}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
	];
}

/** Set-Cookie values that forget the wait, once signed in. */
export function clearedSignInCookies(): string[] {
	return [BROWSER, BACK].map(
		(name) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
	);
}

/**
 * Signed in, by link or by code. A new member gets the explanation first;
 * anyone else goes back where they were sent to sign in from (an assistant's
 * consent screen, say), or to the books.
 */
export function signedIn(session: Session, back: string | null): Response {
	const headers = new Headers({
		location: session.isNew ? "/start" : (back ?? "/"),
	});
	headers.append("set-cookie", sessionCookie(session.token, session.expiresAt));
	for (const cookie of clearedSignInCookies())
		headers.append("set-cookie", cookie);
	return new Response(null, { status: 303, headers });
}
