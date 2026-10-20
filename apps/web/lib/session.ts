import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * The `__Host-` prefix is a browser-enforced promise: Secure, Path=/, and no
 * Domain, so the cookie belongs to this hostname alone. On a shared parent
 * domain that matters — a sibling community's subdomain can set a cookie on
 * the parent, and without the prefix a forged one of the same name would be
 * sent to us alongside the real one.
 */
export const SESSION_COOKIE = "__Host-session";

/** The bearer token for core, or null when signed out. */
export async function sessionToken(): Promise<string | null> {
	return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export function sessionCookie(token: string, expiresAt: number): string {
	const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
	return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
	return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** For pages that only make sense signed in: bounce to /login otherwise. */
export async function requireSession(): Promise<string> {
	const token = await sessionToken();
	if (!token) redirect("/login");
	return token;
}

/** Core said 401 — the cookie is stale or revoked. Same answer: sign in again. */
export function signedOut(status: number): never {
	void status;
	redirect("/login");
}
