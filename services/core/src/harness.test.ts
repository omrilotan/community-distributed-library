import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { COPY_B, DANA, SAM, WORK } from "../test/api.ts";

/** What one test changes in the fixtures, the next does not inherit. */
describe("the fixtures", () => {
	it("may be changed by a test", async () => {
		await env.DB.batch([
			env.DB.prepare("UPDATE communities SET name = 'Elsewhere'"),
			env.DB.prepare(
				"UPDATE memberships SET role = 'admin', status = 'suspended' WHERE member_id = ?",
			).bind(SAM),
			env.DB.prepare(
				"UPDATE members SET display_name = 'Mallory' WHERE id = ?",
			).bind(DANA),
			env.DB.prepare("UPDATE works SET title = 'Retitled' WHERE id = ?").bind(
				WORK,
			),
			env.DB.prepare(
				"UPDATE copies SET lending = 'paused', note = 'Gone' WHERE id = ?",
			).bind(COPY_B),
		]);
	});

	it("are as they were for the next", async () => {
		const read = (sql: string, ...values: string[]) =>
			env.DB.prepare(sql)
				.bind(...values)
				.first();
		expect(await read("SELECT name FROM communities")).toEqual({
			name: "Our Street",
		});
		expect(
			await read(
				"SELECT role, status FROM memberships WHERE member_id = ?",
				SAM,
			),
		).toEqual({ role: "member", status: "active" });
		expect(
			await read("SELECT display_name FROM members WHERE id = ?", DANA),
		).toEqual({ display_name: "Dana" });
		expect(await read("SELECT title FROM works WHERE id = ?", WORK)).toEqual({
			title: "Oz",
		});
		expect(
			await read("SELECT lending, note FROM copies WHERE id = ?", COPY_B),
		).toEqual({ lending: "lendable", note: null });
	});
});
