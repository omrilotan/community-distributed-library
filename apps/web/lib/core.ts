import { env } from "cloudflare:workers";
import { cookies, headers as requestHeaders } from "next/headers";
import { SESSION_COOKIE } from "./session.ts";

interface CoreEnv {
	CORE?: Fetcher;
}

/**
 * Development talks to `npm run dev:api` over plain HTTP. The service binding
 * is production-only: in `vinext dev` it can resolve to the deployed worker,
 * which must never happen from a developer machine.
 */
const DEV_CORE_URL = "http://localhost:8787";
const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * Every call the web app makes goes through the public API, exactly as an MCP
 * client or a third party would (decision 0014). There is no private path.
 * The session cookie becomes a bearer token; nothing else identifies the caller.
 */
/** Reach core with the caller's own headers: the REST proxy under /api/v1. */
/**
 * Core limits sign-in links, contact messages and the like per address. A call
 * over the service binding arrives without the visitor's address, so it is
 * passed on under a header of our own, always overwritten, never taken from
 * the visitor. Core is not reachable except through bindings.
 */
export const CLIENT_IP_HEADER = "x-cdl-client-ip";

export async function clientIp(): Promise<Record<string, string>> {
	try {
		const ip = (await requestHeaders()).get("cf-connecting-ip");
		return ip ? { [CLIENT_IP_HEADER]: ip } : {};
	} catch {
		// Outside a request: nobody to attribute the call to.
		return {};
	}
}

export function coreRaw(path: string, init: RequestInit): Promise<Response> {
	const bindings = env as unknown as CoreEnv;
	const useBinding = !isDevelopment && Boolean(bindings.CORE);
	return send(
		new Request(
			new URL(path, useBinding ? "http://cdl-core" : DEV_CORE_URL),
			init,
		),
	);
}

async function send(request: Request): Promise<Response> {
	const bindings = env as unknown as CoreEnv;
	const useBinding = !isDevelopment && Boolean(bindings.CORE);
	const once = (attempt: Request) =>
		useBinding ? bindings.CORE!.fetch(attempt) : fetch(attempt);
	// A read whose connection drops ("Network connection lost", retryable)
	// is asked once more; a write is not, since it may have landed.
	const canRetry = request.method === "GET" || request.method === "HEAD";
	// The workers types give clone() its own Request generics; it is the same request.
	const spare = canRetry ? (request.clone() as unknown as Request) : null;
	try {
		return await once(request);
	} catch (error) {
		if (!spare) throw error;
		await new Promise((resolve) => setTimeout(resolve, 150));
		return once(spare);
	}
}

export async function core<T>(
	path: string,
	init: RequestInit & { token?: string | null } = {},
): Promise<{ status: number; body: T; headers: Headers }> {
	const bindings = env as unknown as CoreEnv;
	const useBinding = !isDevelopment && Boolean(bindings.CORE);
	const url = new URL(path, useBinding ? "http://cdl-core" : DEV_CORE_URL);
	const token =
		init.token === undefined
			? ((await cookies()).get(SESSION_COOKIE)?.value ?? null)
			: init.token;

	const request = new Request(url, {
		...init,
		headers: {
			accept: "application/json",
			...(typeof init.body === "string"
				? { "content-type": "application/json" }
				: {}),
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(init.headers as Record<string, string> | undefined),
			...(await clientIp()),
		},
	});

	const response = await send(request);
	// A failing core may answer with plain text; the status still says what
	// happened, and that is what callers go by.
	const body =
		response.status === 204
			? (null as T)
			: ((await response.json().catch(() => null)) as T);
	return { status: response.status, body, headers: response.headers };
}
