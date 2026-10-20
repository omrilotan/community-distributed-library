import { WorkerEntrypoint } from "cloudflare:workers";
import { Isbn13, type MetadataLookup } from "@cdl/contracts";
import type { ProviderEnv } from "./providers.ts";
import { lookup } from "./lookup.ts";

export interface Env extends ProviderEnv {
	DB: D1Database;
}

export default class Metadata extends WorkerEntrypoint<Env> {
	/** Called by `core` over a service binding. */
	async lookup(isbn: string): Promise<MetadataLookup | null> {
		return lookup(this.env.DB, this.env, Isbn13.parse(isbn));
	}

	/** Standalone HTTP, so the service runs and is testable on its own. */
	override async fetch(request: Request): Promise<Response> {
		const { pathname } = new URL(request.url);
		const match = pathname.match(/^\/lookup\/(\d{13})$/);
		if (!match) return new Response("not found", { status: 404 });

		const result = await this.lookup(match[1]!);
		return Response.json(result, { status: result ? 200 : 404 });
	}
}
