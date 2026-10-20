import type { Env } from "./env.ts";
import { theLibrary } from "./library.ts";

/**
 * A nightly snapshot of the whole database as SQL, written to a private
 * bucket. D1 Time Travel already covers the last 30 days; this survives
 * losing the database, or the account, and can be replayed into a fresh one
 * with `wrangler d1 execute --file`.
 */
const KEEP_DAYS = 30;

export async function backup(
	env: Env,
	at = new Date(),
): Promise<{
	key: string;
	tables: number;
	rows: number;
	bytes: number;
} | null> {
	if (!env.BACKUPS) return null;

	const { results: tables } = await env.DB.prepare(
		`SELECT name FROM sqlite_master
		  WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
		  ORDER BY name`,
	).all<{ name: string }>();

	const day = at.toISOString().slice(0, 10);
	const lines = [
		`-- ${(await theLibrary(env)).name} — snapshot ${at.toISOString()}`,
		"PRAGMA defer_foreign_keys = true;",
	];
	let rows = 0;

	// The migration bookkeeping replays itself; the schema comes from the
	// migrations, so a restore runs those first and then this file.
	const names = tables
		.map(({ name }) => name)
		.filter((name) => name !== "d1_migrations");
	// One batch is one transaction: every table as of the same moment, so a
	// member who joins mid-snapshot is in it with their membership, or not at
	// all, and the restore's foreign keys hold.
	const reads = await env.DB.batch(
		names.map((name) => env.DB.prepare(`SELECT * FROM "${name}"`)),
	);

	for (const [index, name] of names.entries()) {
		const results = (reads[index]?.results ?? []) as Record<string, unknown>[];
		if (results.length === 0) continue;
		lines.push(`-- ${name}: ${results.length}`);
		const columns = Object.keys(results[0]!);
		for (const row of results) {
			const values = columns.map((column) => literal(row[column]));
			lines.push(
				`INSERT OR REPLACE INTO "${name}" (${columns
					.map((column) => `"${column}"`)
					.join(", ")}) VALUES (${values.join(", ")});`,
			);
		}
		rows += results.length;
	}

	const body = lines.join("\n") + "\n";
	const key = `d1/${day}.sql`;
	await env.BACKUPS.put(key, body, {
		httpMetadata: { contentType: "application/sql" },
	});
	await prune(env, at);
	return { key, tables: tables.length, rows, bytes: body.length };
}

/** Older than KEEP_DAYS goes; the keys are dated, so this is a string compare. */
async function prune(env: Env, at: Date): Promise<void> {
	const cutoff = new Date(at.getTime() - KEEP_DAYS * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const listed = await env.BACKUPS!.list({ prefix: "d1/" });
	const old = listed.objects
		.map((object) => object.key)
		.filter((key) => key < `d1/${cutoff}.sql`);
	if (old.length) await env.BACKUPS!.delete(old);
}

function literal(value: unknown): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number")
		return Number.isFinite(value) ? String(value) : "NULL";
	if (typeof value === "boolean") return value ? "1" : "0";
	if (value instanceof ArrayBuffer) return `X'${hex(new Uint8Array(value))}'`;
	const text = String(value);
	// Control characters go as their bytes: a NUL stops SQLite's parser, and
	// a line break would split a statement for anything reading one a line.
	if (/[\u0000-\u001f]/.test(text))
		return `CAST(X'${hex(new TextEncoder().encode(text))}' AS TEXT)`;
	return `'${text.replace(/'/g, "''")}'`;
}

function hex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
