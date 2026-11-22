import { log, runJob } from "@cdl/contracts";
import { sendDigest } from "./digest.ts";
import { libraries, type Env } from "./env.ts";
import { TOOLS } from "./tools.ts";

/**
 * cdl-ops: the operator's MCP server, for questions about every library
 * (docs/observability-plan.md, layer 4), at ops.<domain>/mcp. Operator only:
 * a bearer token (.keys/ops.key, the OPS_TOKEN secret), never a member's or
 * moderator's. It also keeps the alerts Cloudflare posts to /alerts, and
 * sends the weekly digest on Mondays.
 *
 * The MCP is stateless Streamable HTTP: each POST is one JSON-RPC message or
 * a batch, answered with JSON.
 */

const PROTOCOL = "2025-06-18";
const INSTRUCTIONS =
	"Questions about the community libraries this operator runs. Start with fleet_status. Answers are counts, ids and statuses: no member is ever named. run_check and take_backup change nothing members see, but ask the operator before calling them with confirm: true. For a fix, explain_alert gives the runbook and a prompt for Claude Code in the repository; never deploy.";

/** Equal without saying where they differ. */
async function same(given: string, wanted: string): Promise<boolean> {
	const digest = async (value: string) =>
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
		);
	const [a, b] = await Promise.all([digest(given), digest(wanted)]);
	let differ = 0;
	for (let at = 0; at < a.length; at += 1) differ |= a[at]! ^ b[at]!;
	return differ === 0 && wanted.length > 0;
}

interface Message {
	jsonrpc: "2.0";
	id?: string | number | null;
	method?: string;
	params?: Record<string, unknown>;
}

const reply = (id: Message["id"], result: unknown) => ({
	jsonrpc: "2.0",
	id: id ?? null,
	result,
});
const failure = (id: Message["id"], code: number, message: string) => ({
	jsonrpc: "2.0",
	id: id ?? null,
	error: { code, message },
});

export async function answer(env: Env, message: Message) {
	const { id, method, params = {} } = message;
	if (id === undefined) return null; // A notification: nothing to say.
	switch (method) {
		case "initialize":
			return reply(id, {
				protocolVersion:
					typeof params.protocolVersion === "string"
						? params.protocolVersion
						: PROTOCOL,
				capabilities: { tools: {} },
				serverInfo: { name: "cdl-ops", version: "1.0.0" },
				instructions: INSTRUCTIONS,
			});
		case "ping":
			return reply(id, {});
		case "tools/list":
			return reply(id, {
				tools: TOOLS.map(({ name, description, inputSchema }) => ({
					name,
					description,
					inputSchema,
				})),
			});
		case "tools/call": {
			const tool = TOOLS.find((one) => one.name === params.name);
			if (!tool) return failure(id, -32602, `No tool ${String(params.name)}`);
			try {
				const result = await tool.run(
					env,
					(params.arguments ?? {}) as Record<string, unknown>,
				);
				return reply(id, {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				});
			} catch (error) {
				return reply(id, {
					content: [
						{
							type: "text",
							text: error instanceof Error ? error.message : String(error),
						},
					],
					isError: true,
				});
			}
		}
		default:
			return failure(id, -32601, `No method ${String(method)}`);
	}
}

/** Cloudflare's alert webhook: keep what it says, 90 days. */
async function keepAlert(env: Env, request: Request): Promise<Response> {
	const given = request.headers.get("cf-webhook-auth") ?? "";
	if (!(await same(given, env.ALERTS_SECRET ?? "")))
		return new Response("Not allowed", { status: 403 });
	const body = (await request.json().catch(() => null)) as {
		name?: string;
		text?: string;
		alert_type?: string;
		data?: Record<string, unknown>;
	} | null;
	if (!body) return new Response("Not JSON", { status: 400 });
	const name = String(body.name ?? body.alert_type ?? "alert").slice(0, 200);
	const text = String(body.text ?? JSON.stringify(body.data ?? {})).slice(
		0,
		4000,
	);
	// The policies are named "CDL: <slug>: …" (scripts/observe.mjs).
	const named = /^CDL: ([a-z][a-z0-9-]*):/.exec(name)?.[1];
	const library =
		libraries(env).find((lib) => lib.slug === named)?.slug ??
		libraries(env).find((lib) => text.includes(`${lib.slug}-`))?.slug ??
		null;
	const at = Math.floor(Date.now() / 1000);
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO alerts (id, received_at, library, name, alert_type, text) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(
			crypto.randomUUID(),
			at,
			library,
			name,
			body.alert_type ?? null,
			text,
		),
		env.DB.prepare("DELETE FROM alerts WHERE received_at < ?").bind(
			at - 90 * 86_400,
		),
	]);
	log.info("alert.received", { library, alertType: body.alert_type ?? null });
	return new Response(null, { status: 204 });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/alerts" && request.method === "POST")
			return keepAlert(env, request);
		if (url.pathname !== "/mcp")
			return new Response("cdl-ops: the operator's MCP is at /mcp\n");
		const bearer = /^Bearer (.+)$/.exec(
			request.headers.get("authorization") ?? "",
		)?.[1];
		if (!bearer || !(await same(bearer, env.OPS_TOKEN ?? "")))
			return new Response("Operator only", {
				status: 401,
				headers: { "www-authenticate": 'Bearer realm="cdl-ops"' },
			});
		if (request.method !== "POST")
			return new Response("POST JSON-RPC here", {
				status: 405,
				headers: { allow: "POST" },
			});
		const body = (await request.json().catch(() => null)) as
			Message | Message[] | null;
		if (!body)
			return Response.json(failure(null, -32700, "Not JSON"), { status: 400 });
		const answers = (
			await Promise.all(
				(Array.isArray(body) ? body : [body]).map((one) => answer(env, one)),
			)
		).filter(Boolean);
		if (!answers.length) return new Response(null, { status: 202 });
		return Response.json(Array.isArray(body) ? answers : answers[0]);
	},

	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			runJob(env.DB, "digest", async () => ({ sent: await sendDigest(env) })),
		);
	},
};
