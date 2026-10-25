import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Scope } from "@cdl/contracts";

export interface CoreInternal {
	redeemConsent(code: string): Promise<{
		token: string;
		memberId: string;
		scopes: Scope[];
		clientName: string;
	} | null>;
}

export interface Env {
	OAUTH_KV: KVNamespace;
	OAUTH_PROVIDER: OAuthHelpers;
	CORE: Fetcher;
	CORE_INTERNAL: Fetcher & CoreInternal;
	/** Dynamic client registrations allowed per caller address (wrangler.jsonc). */
	REGISTER_LIMIT: RateLimit;
	/** Where the consent screen lives (the web app). */
	APP_URL: string;
	/** This worker's public origin — the OAuth resource identifier. */
	SELF_URL: string;
}

/** What the OAuth grant carries into every MCP request. Encrypted at rest by the provider. */
export interface Props {
	memberId: string;
	scopes: Scope[];
	/** Core's own scoped token for this grant; all tool calls use it. */
	coreToken: string;
	clientName: string;
}
