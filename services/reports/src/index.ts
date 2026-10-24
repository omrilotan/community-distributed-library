/**
 * Where browsers post what went wrong: content security policy refusals and
 * network errors, named as `cdl-csp` and `cdl-nel` in the pages'
 * Reporting-Endpoints header. Anybody can post here — that is how the
 * Reporting API works — so nothing is trusted and nothing is stored but a row
 * in Analytics Engine.
 */

export interface Env {
	ANALYTICS?: AnalyticsEngineDataset;
}

/** A report is small. Anything bigger is not one. */
const MAX_BODY_BYTES = 64 * 1024;

/** One post can carry a batch; a long one is somebody being tedious. */
const MAX_REPORTS = 20;

interface Report {
	type?: string;
	body?: Record<string, unknown>;
	/** The old `application/csp-report` shape, which has no envelope. */
	legacy?: boolean;
}

/**
 * Analytics Engine columns are positional — `blob1`, `double2` — so what each
 * one holds is written down nowhere but here. One labelled tuple per report
 * shape, and the writes below are checked against them. Changing an order
 * changes what a query means, so append rather than reorder.
 */
interface CSPViolation {
	blobs: [
		type: "csp-violation",
		document: string,
		directive: string,
		blocked: string,
		disposition: string,
		sourceFile: string,
		userAgent: string,
	];
	doubles: [line: number, column: number, count: 1];
	indexes: [document: string];
}

interface NetworkError {
	blobs: [
		type: "network-error",
		url: string,
		error: string,
		phase: string,
		status: string,
		method: string,
		userAgent: string,
	];
	doubles: [status: number, samplingFraction: number, count: 1];
	indexes: [host: string];
}

/** Anything unnamed: the body is kept whole so a new report type is not lost. */
interface OtherReport {
	blobs: [
		type: string,
		body: string,
		unused3: "",
		unused4: "",
		unused5: "",
		unused6: "",
		userAgent: string,
	];
	doubles: [unused1: 0, unused2: 0, count: 1];
	indexes: [host: string];
}

export type DataPoint = CSPViolation | NetworkError | OtherReport;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		// Only on the custom domain, even if workers.dev is ever switched back on.
		if (url.hostname.endsWith(".workers.dev")) {
			return new Response(null, { status: 404 });
		}

		if (request.method === "GET" && url.pathname === "/health") {
			return new Response("ok", { status: 200 });
		}
		// An endpoint for browsers to post to, not a page for anybody to find.
		if (request.method === "GET" && url.pathname === "/robots.txt") {
			return new Response("User-agent: *\nDisallow: /\n", {
				headers: { "content-type": "text/plain; charset=utf-8" },
			});
		}
		if (request.method !== "POST") return new Response(null, { status: 405 });

		const declared = Number(request.headers.get("content-length") ?? 0);
		if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });

		// Read as it arrives and stop at the cap: a missing or false
		// content-length must not get a large body buffered.
		const text = await readCapped(request, MAX_BODY_BYTES);
		if (text === undefined) return new Response(null, { status: 400 });
		if (text === null) return new Response(null, { status: 413 });
		if (!text) return new Response(null, { status: 204 });

		// A malformed report is still just a report: accept it and move on.
		let payload: unknown;
		try {
			payload = JSON.parse(text);
		} catch {
			return new Response(null, { status: 204 });
		}

		const userAgent = request.headers.get("user-agent") ?? "";
		for (const report of reportsIn(payload).slice(0, MAX_REPORTS)) {
			try {
				write(env, url, report, userAgent);
			} catch (error) {
				console.error("failed to write a report", error);
			}
		}
		return new Response(null, { status: 204 });
	},
};

/** Reporting API v1 sends an array; the old CSP format sends one object. */
function reportsIn(payload: unknown): Report[] {
	if (Array.isArray(payload))
		return payload.filter(
			(entry): entry is Report => !!entry && typeof entry === "object",
		);
	if (payload && typeof payload === "object") {
		const legacy = (payload as Record<string, unknown>)["csp-report"];
		if (legacy && typeof legacy === "object") {
			return [
				{
					type: "csp-violation",
					body: legacy as Record<string, unknown>,
					legacy: true,
				},
			];
		}
		return [payload as Report];
	}
	return [];
}

function text(value: unknown, limit = 500): string {
	return typeof value === "string" ? value.slice(0, limit) : "";
}

function number(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * One data point per report. The two shapes worth naming get their own
 * columns; anything else is kept whole so a new report type is not lost.
 */
function write(env: Env, url: URL, report: Report, userAgent: string): void {
	if (!env.ANALYTICS) return;

	const type =
		text(report.type, 100) || (report.legacy ? "csp-violation" : "unknown");
	const body: Record<string, unknown> = report.body ?? {
		...(report as Record<string, unknown>),
	};

	if (type === "csp-violation") {
		// Hyphenated keys are the old format; camelCase is the current one.
		const document = address(text(body.documentURL ?? body["document-uri"]));
		const point: CSPViolation = {
			blobs: [
				"csp-violation",
				document,
				text(
					body.violatedDirective ??
						body["violated-directive"] ??
						body.effectiveDirective ??
						body["effective-directive"],
				),
				address(text(body.blockedURL ?? body["blocked-uri"])),
				text(body.disposition ?? (report.legacy ? "enforce" : "")),
				address(text(body.sourceFile ?? body["source-file"], 200)),
				userAgent.slice(0, 200),
			],
			doubles: [
				number(body.lineNumber ?? body["line-number"]),
				number(body.columnNumber ?? body["column-number"]),
				1,
			],
			// An index holds 96 bytes at most: the host, never the whole address.
			indexes: [index(hostOf(document) ?? url.hostname)],
		};
		env.ANALYTICS.writeDataPoint(point);
		return;
	}

	if (type === "network-error") {
		const failed = address(text(body.url));
		const point: NetworkError = {
			blobs: [
				"network-error",
				failed,
				text(body.type),
				text(body.phase),
				String(body.status_code ?? "").slice(0, 16),
				text(body.method),
				userAgent.slice(0, 200),
			],
			doubles: [number(body.status_code), number(body.sampling_fraction), 1],
			indexes: [index(hostOf(failed) ?? url.hostname)],
		};
		env.ANALYTICS.writeDataPoint(point);
		return;
	}

	const point: OtherReport = {
		blobs: [
			type,
			JSON.stringify(body).slice(0, 500),
			"",
			"",
			"",
			"",
			userAgent.slice(0, 200),
		],
		doubles: [0, 0, 1],
		indexes: [index(url.hostname)],
	};
	env.ANALYTICS.writeDataPoint(point);
}

/**
 * An address as kept: without its query or fragment, which can carry a
 * sign-in token (/auth/callback?token=) or an invitation (/join?invite=).
 */
function address(value: string): string {
	return value.replace(/[?#].*$/, "");
}

/** Analytics Engine refuses an index over 96 bytes, and the report with it. */
function index(value: string): string {
	const bytes = new TextEncoder().encode(value);
	return bytes.length <= 96
		? value
		: new TextDecoder().decode(bytes.slice(0, 96));
}

/** A report's URL comes from the network, so it may not be one. */
function hostOf(value: string): string | null {
	try {
		return new URL(value).hostname;
	} catch {
		return null;
	}
}

/** The body as text, null past the cap (in bytes), undefined if unreadable. */
async function readCapped(
	request: Request,
	cap: number,
): Promise<string | null | undefined> {
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let total = 0;
	let text = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > cap) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
		return text + decoder.decode();
	} catch {
		return undefined;
	}
}
