/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { Env as CoreEnv } from "../src/env.ts";

/** `cloudflare:test` types `env` as `Cloudflare.Env`; give it this worker's shape. */
declare global {
	namespace Cloudflare {
		interface Env extends CoreEnv {
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}
