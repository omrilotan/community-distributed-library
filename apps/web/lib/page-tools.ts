import {
	kindOf,
	memberTools,
	moderatorTools,
	type Call,
	type Tool,
	type Upload,
} from "@cdl/tools";
import { z } from "zod";
import { core, coreRaw, clientIp } from "./core.ts";
import { getMe } from "./profile.ts";
import { library } from "./library.ts";
import { sessionToken } from "./session.ts";
import { moderates, viewingAsMember } from "./view-as.ts";

/**
 * The library's own pages offer an agent in the browser the same tools its
 * MCP server offers an assistant (@cdl/tools), through WebMCP. The page
 * registers them; each call comes back here and runs as the signed-in
 * member, with their session, so nothing new is reachable: core decides as
 * it does for any other call.
 *
 * A moderator's tools are for a moderator, not while they look at the
 * library as a member does.
 */
export async function pageTools(): Promise<Tool[] | null> {
	if (!(await sessionToken())) return null;
	const [me, info] = await Promise.all([getMe(), library()]);
	if (me.status !== 200) return null;
	const moderator = moderates(me.body.role) && !(await viewingAsMember());
	return [
		...memberTools(info.type),
		...(moderator ? moderatorTools(info.type) : []),
	];
}

/**
 * One tool as WebMCP wants it: its input as JSON Schema, and the hints a
 * browser goes by. Everything a tool returns may hold what another member
 * wrote, so it is all marked untrusted; whatever changes something is
 * consequential, for the browser to ask the member first.
 */
export function described(tool: Tool) {
	const { kind, note } = kindOf(tool.name);
	return {
		name: tool.name,
		description: note ? `${tool.description} ${note}` : tool.description,
		inputSchema: z.toJSONSchema(z.object(tool.input)),
		annotations: {
			readOnlyHint: kind === "read",
			consequentialHint: kind !== "read",
			untrustedContentHint: true,
		},
	};
}

/** Core, as the member whose session this is. */
export const sessionCall: Call = async (path, init = {}) => {
	const { status, body } = await core(path, {
		method: init.method ?? "GET",
		...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
	});
	return { status, body: body as never };
};

/** An image the agent already holds, stored as the web form stores one. */
export const sessionUpload: Upload = async (data, contentType) => {
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
	const token = await sessionToken();
	const response = await coreRaw("/v1/covers", {
		method: "POST",
		headers: {
			accept: "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(await clientIp()),
		},
		body: form,
	});
	return {
		status: response.status,
		body: (await response.json().catch(() => ({}))) as { coverUrl?: string },
	};
};
