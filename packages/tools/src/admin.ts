import { z } from "zod";
import type { LibraryType } from "@cdl/contracts";
import { tool, type Tool } from "./tool.ts";

/**
 * What the library's admin can ask about how the library itself is doing:
 * the same counts the operator watches (docs/observability-plan.md), for
 * this library only. Offered with the moderator tools (the admin scope);
 * core answers the library's admin alone, and a moderator gets a refusal.
 * Counts, ids and statuses: never another member's words.
 */
export function adminTools(type: LibraryType): Tool[] {
	// A library of things has photos, not covers; the job keeps its name.
	const rehost =
		type === "things"
			? "the nightly job that keeps photos on the library's own storage"
			: "rehost-covers";
	return [
		tool(
			"library_health",
			"Library admins: is the library working? Its database, images, email and conversations; checks that should be 0 (sign-in emails failing, emails or loan requests stuck, last night's backup missing, conversations kept past 90 days, copies that disagree with their loans) with how long each has failed; scheduled jobs and whether any is late; and how many emails and notices are waiting. Start here for 'is anything wrong?'.",
			{},
			(_input, { call }) => call("/v1/admin/health"),
		),

		tool(
			"job_runs",
			`Library admins: the scheduled jobs' recent runs, newest first, to answer 'did every backup run this week?'. Jobs: backup, reminders, snapshot, checks, revoke-consents and ${rehost} (daily); emails, held-notices, webhooks (every minute, failures only). Kept 30 days.`,
			{
				job: z.string().optional(),
				days: z.number().int().min(1).max(30).optional(),
			},
			({ job, days }, { call }) => {
				const search = [
					job ? `job=${encodeURIComponent(job)}` : "",
					days ? `days=${days}` : "",
				]
					.filter(Boolean)
					.join("&");
				return call(`/v1/admin/jobs${search ? `?${search}` : ""}`);
			},
		),

		tool(
			"delivery_trace",
			"Library admins: why did somebody not hear about a loan? One loan's path: its events, the owner's held notice (still there means not sent yet) and webhook deliveries, by ids, times and statuses. Find the loan's id on the member's page or with list_my_loans.",
			{ loanId: z.string() },
			({ loanId }, { call }) =>
				call(`/v1/admin/loans/${encodeURIComponent(loanId)}/delivery`),
		),

		tool(
			"library_numbers",
			"Library admins: the library as a community now, counted exactly: members and how many were active in 7 and 30 days, items, lendable and on loan, overdue loans, the week's requests and how many were agreed, owners' median answer time in seconds, invites and asks.",
			{},
			(_input, { call }) => call("/v1/admin/numbers"),
		),

		tool(
			"run_checks",
			"Library admins: run the library's checks now, one (by name, from library_health) or all, to see whether a fix worked. Safe: it reads and records, changes nothing members see.",
			{ check: z.string().optional() },
			({ check }, { call }) =>
				call("/v1/admin/checks", {
					method: "POST",
					body: check ? { check } : {},
				}),
		),
	];
}
