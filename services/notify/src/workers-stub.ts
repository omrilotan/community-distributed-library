/** Stands in for `cloudflare:workers` when tests run in plain Node. */
export class WorkerEntrypoint<Env> {
	constructor(
		protected ctx: unknown,
		protected env: Env,
	) {}
}
