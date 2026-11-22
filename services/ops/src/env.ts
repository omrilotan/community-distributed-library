import type { JobState } from "@cdl/contracts";

/** What a library's core answers the ops MCP (services/core/src/ops.ts). */
export interface LibraryOps {
	opsStatus(): Promise<LibraryStatus>;
	opsJobRuns(job: string | null, days: number): Promise<unknown[]>;
	opsDeliveryTrace(loanId: string): Promise<unknown>;
	opsAdmins(): Promise<string[]>;
	opsRunCheck(name?: string): Promise<unknown[]>;
	opsTakeBackup(): Promise<unknown>;
}

export interface CheckRow {
	name: string;
	value: number;
	previous_value: number | null;
	severity: string;
	checked_at: number;
	failing_since: number | null;
}

export interface LibraryStatus {
	library: string;
	deployedAt: number | null;
	ok: boolean;
	parts: Record<string, string>;
	late: string[];
	checks: CheckRow[];
	jobs: (JobState & { worker: string })[];
	queues: Record<string, number>;
}

/** One library as the manifest describes it to ops. */
export interface Library {
	slug: string;
	host: string;
	/** The name of the binding to its core's Internal entrypoint. */
	binding: string;
	/** The sampling rates its Workers deploy with (scripts/libraries.mjs). */
	sampling: Record<string, Record<string, number>>;
}

export interface Env {
	DB: D1Database;
	ANALYTICS_SQL?: AnalyticsSQLBinding;
	EMAIL?: SendEmail;
	/** JSON: Library[]. */
	LIBRARIES: string;
	FROM_ADDRESS: string;
	/** The operator's address, told of every failure; may be empty. */
	ALERTS_EMAIL?: string;
	/** Secret: the bearer token MCP clients send (.keys/ops.key). */
	OPS_TOKEN?: string;
	/** Secret: what Cloudflare's alert webhook sends in cf-webhook-auth. */
	ALERTS_SECRET?: string;
	[binding: string]: unknown;
}

export function libraries(env: Env): Library[] {
	try {
		return JSON.parse(env.LIBRARIES) as Library[];
	} catch {
		return [];
	}
}

export function core(env: Env, lib: Library): LibraryOps {
	return env[lib.binding] as LibraryOps;
}
