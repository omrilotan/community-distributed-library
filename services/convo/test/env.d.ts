/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { Env as ConvoEnv } from "../src/index.ts";

/** `cloudflare:test` types `env` as `Cloudflare.Env`; give it this worker's shape. */
declare global {
	namespace Cloudflare {
		interface Env extends ConvoEnv {
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}
