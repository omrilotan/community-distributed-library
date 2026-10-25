import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { app } from "../src/app.ts";

export const DANA = "01J0MEMBER00000000000DANA";
export const SAM = "01J0MEMBER0000000000SAM00";
export const NOA = "01J0MEMBER00000000000NXA00";
export const COPY_A = "01J0KPYA00000000000000000A"; // relay allowed
export const COPY_B = "01J0KPYB00000000000000000B";
export const WORK = "01J0WRK0000000000000000ZZ0";

/**
 * Call the worker as a member (dev header) or with a bearer token. The
 * answer comes back once the work the call left running (events, deliveries,
 * emails) is done too, so a test reads what it caused without waiting on a
 * clock.
 */
export async function api(
	who: { member: string } | { token: string } | null,
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; body: any }> {
	const headers: Record<string, string> = { accept: "application/json" };
	if (who && "member" in who) headers["X-Member-Id"] = who.member;
	if (who && "token" in who) headers.authorization = `Bearer ${who.token}`;
	if (body !== undefined) headers["content-type"] = "application/json";
	const ctx = createExecutionContext();
	const response = await app.request(
		`http://core.test${path}`,
		{
			method,
			headers,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		},
		env,
		ctx,
	);
	const text = await response.text();
	await waitOnExecutionContext(ctx);
	return { status: response.status, body: text ? JSON.parse(text) : null };
}

export const as = (member: string) => ({
	get: (path: string) => api({ member }, "GET", path),
	post: (path: string, body?: unknown) =>
		api({ member }, "POST", path, body ?? {}),
	patch: (path: string, body: unknown) => api({ member }, "PATCH", path, body),
	put: (path: string, body: unknown) => api({ member }, "PUT", path, body),
	del: (path: string) => api({ member }, "DELETE", path),
});

/** Request → accept → handed: a live loan of `copy` to `borrower`. */
export async function activeLoan(
	borrower: string,
	lender: string,
	copy: string,
) {
	const requested = await as(borrower).post("/v1/loans", { copyId: copy });
	if (requested.status !== 201) throw new Error(JSON.stringify(requested.body));
	const id = requested.body.id as string;
	await as(lender).post(`/v1/loans/${id}/accept`);
	await as(lender).post(`/v1/loans/${id}/handed`);
	return id;
}

/**
 * The few minutes a new request waits before its owner hears of it, passed:
 * every held notice falls due and the scheduled pass sends it, as the cron
 * would.
 */
export async function heard() {
	const { sendHeldNotices } = await import("../src/notify.ts");
	await env.DB.prepare("UPDATE held_notices SET send_at = 0").run();
	return sendHeldNotices(env);
}
