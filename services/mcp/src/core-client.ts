import type { Env, Props } from "./env.ts";

/**
 * What to do when core turns the connection's token away: it was revoked on
 * /connect, replaced, its member erased, or it ran out.
 */
export type OnRevoked = () => Promise<void>;

/** Calls core's public API as the member, exactly as the web app does. */
export function coreClient(env: Env, props: Props, onRevoked?: OnRevoked) {
	return async function call<T>(
		path: string,
		init: { method?: string; body?: object } = {},
	): Promise<{ status: number; body: T }> {
		const headers: Record<string, string> = {
			accept: "application/json",
			authorization: `Bearer ${props.coreToken}`,
		};
		const request: RequestInit = { method: init.method ?? "GET", headers };
		if (init.body !== undefined) {
			headers["content-type"] = "application/json";
			request.body = JSON.stringify(init.body);
		}
		const response = await env.CORE.fetch(
			new Request(new URL(path, "http://cdl-core"), request),
		);
		if (response.status === 401) await onRevoked?.();
		const body =
			response.status === 204 ? (null as T) : ((await response.json()) as T);
		return { status: response.status, body };
	};
}

/**
 * Multipart upload of an image the client already holds (base64), through the
 * same /v1/covers endpoint the web form uses. A data: URL is accepted too.
 */
export function coverUploader(env: Env, props: Props) {
	return async function upload(
		data: string,
		contentType?: string,
	): Promise<{ status: number; body: { coverUrl?: string } }> {
		let type = contentType ?? "image/jpeg";
		let base64 = data;
		const dataUrl = data.match(/^data:([^;,]+);base64,(.*)$/s);
		if (dataUrl) {
			type = dataUrl[1]!;
			base64 = dataUrl[2]!;
		}
		const binary = Uint8Array.from(atob(base64.replace(/\s+/g, "")), (char) =>
			char.charCodeAt(0),
		);
		const form = new FormData();
		form.set("file", new File([binary], "cover", { type }), "cover");
		const response = await env.CORE.fetch(
			new Request(new URL("/v1/covers", "http://cdl-core"), {
				method: "POST",
				headers: {
					accept: "application/json",
					authorization: `Bearer ${props.coreToken}`,
				},
				body: form,
			}),
		);
		return {
			status: response.status,
			body: (await response.json()) as { coverUrl?: string },
		};
	};
}
