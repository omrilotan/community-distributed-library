import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

/** Fresh schema plus a small library: one community, three members, two copies. */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
await env.DB.batch([
	env.DB.prepare(
		`INSERT INTO communities (id, slug, name, centre_lat, centre_lng, radius_m, join_policy, loan_days, created_at)
		 VALUES ('01J0COMMUNITY0000000FINCH', 'our-street', 'Our Street', 51.6012, -0.1924, 3000, 'invite', 21, 1)`,
	),
	env.DB.prepare(
		`INSERT INTO members (id, email, display_name, area_lat, area_lng, area_label, locale, created_at) VALUES
		 ('01J0MEMBER00000000000DANA', 'dana@example.com', 'Dana', 51.6021, -0.1890, 'Church End', 'en', 1),
		 ('01J0MEMBER0000000000SAM00', 'sam@example.com', 'Sam', 51.5980, -0.1975, 'North Finchley', 'he', 1),
		 ('01J0MEMBER00000000000NXA00', 'noa@example.com', 'Noa', 51.6000, -0.1900, 'Finchley Central', 'en', 1)`,
	),
	env.DB.prepare(
		`INSERT INTO memberships (member_id, community_id, role, status, joined_at) VALUES
		 ('01J0MEMBER00000000000DANA', '01J0COMMUNITY0000000FINCH', 'moderator', 'active', 1),
		 ('01J0MEMBER0000000000SAM00', '01J0COMMUNITY0000000FINCH', 'member', 'active', 1),
		 ('01J0MEMBER00000000000NXA00', '01J0COMMUNITY0000000FINCH', 'member', 'active', 1)`,
	),
	env.DB.prepare(
		`INSERT INTO works (id, title, authors, search_key, created_at)
		 VALUES ('01J0WRK0000000000000000ZZ0', 'Oz', '["Baum"]', 'oz baum', 1)`,
	),
	env.DB.prepare(
		`INSERT INTO editions (id, work_id, isbn13, title, search_key, created_at)
		 VALUES ('01J0EDTN0000000000000000ZZ', '01J0WRK0000000000000000ZZ0', '9780000000001', 'Oz', 'oz baum', 1)`,
	),
	env.DB.prepare(
		`INSERT INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, created_at) VALUES
		 ('01J0KPYA00000000000000000A', '01J0EDTN0000000000000000ZZ', '01J0MEMBER00000000000DANA', 'shelved', '01J0MEMBER00000000000DANA', 'good', 'lendable', 1, 1),
		 ('01J0KPYB00000000000000000B', '01J0EDTN0000000000000000ZZ', '01J0MEMBER00000000000DANA', 'shelved', '01J0MEMBER00000000000DANA', 'good', 'lendable', 0, 1)`,
	),
	env.DB.prepare(
		`INSERT INTO copy_shares (copy_id, community_id) VALUES
		 ('01J0KPYA00000000000000000A', '01J0COMMUNITY0000000FINCH'),
		 ('01J0KPYB00000000000000000B', '01J0COMMUNITY0000000FINCH')`,
	),
	env.DB.prepare(
		`INSERT INTO work_communities (work_id, community_id, created_at)
		 VALUES ('01J0WRK0000000000000000ZZ0', '01J0COMMUNITY0000000FINCH', 1)`,
	),
]);

/**
 * The fixture rows, and the rows the migrations seed (the built-in tags), as
 * they are now: put back before each test, whatever a test changed in them
 * (a name, a role, a setting, a title) or took away.
 */
const KEPT = [
	"communities",
	"members",
	"memberships",
	"works",
	"editions",
	"copies",
	"copy_shares",
	"work_communities",
	"tag_namespaces",
	"tags",
];
const kept = await Promise.all(
	KEPT.map(async (table) => {
		const [rows, columns] = await Promise.all([
			env.DB.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>(),
			env.DB.prepare(`PRAGMA table_info(${table})`).all<{
				name: string;
				pk: number;
			}>(),
		]);
		const keys = columns.results
			.filter((column) => column.pk > 0)
			.map((column) => column.name);
		return { table, rows: rows.results, keys };
	}),
);

/** Each kept row back as it was: made again if it went, its values if it stayed. */
const restore = () =>
	kept.flatMap(({ table, rows, keys }) =>
		rows.flatMap((row) => {
			const columns = Object.keys(row);
			const values = columns.filter((column) => !keys.includes(column));
			return [
				env.DB.prepare(
					`INSERT OR IGNORE INTO ${table} (${columns.join(", ")})
					 VALUES (${columns.map(() => "?").join(", ")})`,
				).bind(...columns.map((column) => row[column])),
				...(values.length
					? [
							env.DB.prepare(
								`UPDATE ${table} SET ${values.map((column) => `${column} = ?`).join(", ")}
								  WHERE ${keys.map((key) => `${key} = ?`).join(" AND ")}`,
							).bind(
								...values.map((column) => row[column]),
								...keys.map((key) => row[key]),
							),
						]
					: []),
			];
		}),
	);

/** Every test starts from the fixtures above; whatever a test made is gone. */
beforeEach(async () => {
	await env.DB.batch(
		[
			"DELETE FROM moderation_log",
			"DELETE FROM webhook_deliveries",
			"DELETE FROM events",
			"DELETE FROM webhooks",
			"DELETE FROM report_replies",
			"DELETE FROM reports",
			"DELETE FROM waitlist",
			"DELETE FROM loan_reads",
			"DELETE FROM read_works",
			"DELETE FROM wishlist",
			"DELETE FROM handoffs",
			"DELETE FROM loans",
			"DELETE FROM consent_codes",
			"DELETE FROM access_tokens",
			"DELETE FROM availability",
			"DELETE FROM sessions",
			"DELETE FROM magic_links",
			// A member who joined during a test points at the invite they came on.
			"UPDATE members SET invited_by = NULL, invited_via = NULL, away_until = NULL",
			"DELETE FROM invites",
			// What refers to a member goes before the members a test made.
			"DELETE FROM pending_emails",
			"DELETE FROM push_subscriptions",
			`DELETE FROM memberships WHERE member_id NOT IN (
			   '01J0MEMBER00000000000DANA', '01J0MEMBER0000000000SAM00', '01J0MEMBER00000000000NXA00')`,
			`DELETE FROM members WHERE id NOT IN (
			   '01J0MEMBER00000000000DANA', '01J0MEMBER0000000000SAM00', '01J0MEMBER00000000000NXA00')`,
			"DELETE FROM copy_shares WHERE copy_id NOT IN ('01J0KPYA00000000000000000A', '01J0KPYB00000000000000000B')",
			"DELETE FROM copies WHERE id NOT IN ('01J0KPYA00000000000000000A', '01J0KPYB00000000000000000B')",
			"DELETE FROM rate_limits",
			"DELETE FROM contact_messages",
			"DELETE FROM cover_cache",
			"DELETE FROM work_tags",
			"DELETE FROM work_distinct",
			"DELETE FROM tag_proposals",
			"DELETE FROM work_communities WHERE work_id != '01J0WRK0000000000000000ZZ0'",
			"DELETE FROM tag_communities",
			// Seeded tags stay; anything a test approved goes.
			"DELETE FROM tags WHERE builtin = 0",
			"DELETE FROM tag_namespaces WHERE builtin = 0",
			"DELETE FROM editions WHERE id != '01J0EDTN0000000000000000ZZ'",
			"DELETE FROM works WHERE id != '01J0WRK0000000000000000ZZ0'",
		].map((sql) => env.DB.prepare(sql)),
	);
	await env.DB.batch(restore());
});
