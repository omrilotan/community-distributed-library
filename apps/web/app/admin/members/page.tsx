import { cookies } from "next/headers";
import type { AdminMember } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { moderatorOrNull } from "../guard.ts";
import { RowMenu } from "../../row-menu.tsx";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.members} · ${t.admin}`);

export default async function AdminMembers({
	searchParams,
}: {
	searchParams: Promise<{
		error?: string;
		demote?: string;
		member?: string;
		erased?: string;
	}>;
}) {
	const me = await moderatorOrNull();
	const { error, demote, member: only, erased } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const members = await core<{ members: AdminMember[] }>("/v1/admin/members");
	// Short, so the column stays one line on a phone.
	const when = dateFormat(locale, { dateStyle: "short" });
	const everyone = members.status === 200 ? members.body.members : [];
	// One member, when a report or a book page sent the moderator here for them.
	const rows = only ? everyone.filter((row) => row.id === only) : everyone;

	// What this viewer may change a member's role to: the admin's to decide.
	const iAmAdmin = me.role === "admin";
	const roleActions = (
		member: AdminMember,
		self: boolean,
	): [role: string, label: string][] => {
		// Only the admin gives and takes roles; a moderator can only step down.
		if (!iAmAdmin)
			return member.role === "moderator" && self ? [["self", t.demote]] : [];
		if (member.role === "admin")
			return self ? [] : [["moderator", t.removeAdmin]];
		if (member.role === "moderator")
			return [
				self ? ["self", t.demote] : ["member", t.demote],
				["admin", t.makeAdmin],
			];
		return [
			["moderator", t.promote],
			["admin", t.makeAdmin],
		];
	};

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="members" admin={me.role === "admin"} />
			{error ? <Callout tone="warn">{t.adminActionFailed}</Callout> : null}
			{erased ? <Callout>{t.memberErased}</Callout> : null}
			{only ? (
				<p className="muted">
					<a href="/admin/members">{t.allMembers}</a>
				</p>
			) : null}
			{demote === "self" ? (
				<form
					action={`/api/admin/members/${me.id}`}
					method="post"
					className="callout callout-warn"
				>
					<p>{t.demoteSelfConfirm}</p>
					<input type="hidden" name="role" value="member" />
					<div className="actions">
						<button type="submit" className="danger">
							{t.demoteSelfYes}
						</button>
						<a href="/admin/members">{t.removeNo}</a>
					</div>
				</form>
			) : null}
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>{t.colName}</th>
							<th>{t.colRole}</th>
							<th>{t.colStatus}</th>
							<th>{t.colCopies}</th>
							<th>{t.colLastSeen}</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{rows.map((member) => {
							const self = member.id === me.id;
							const actions = roleActions(member, self);
							// Suspending a moderator or the admin is the admin's call.
							const canSuspend =
								!self && (member.role === "member" || iAmAdmin);
							return (
								<tr key={member.id}>
									<td>
										{/* The name leads to their page; the count, to their shelves. */}
										<a href={`/admin/members/${encodeURIComponent(member.id)}`}>
											<bdi>{member.displayName}</bdi>
										</a>
									</td>
									<td>
										<span
											className={`badge${member.role === "member" ? "" : " badge-ok"}`}
										>
											{member.role === "admin"
												? t.roleAdmin
												: member.role === "moderator"
													? t.roleModerator
													: t.roleMember}
										</span>
									</td>
									<td>
										{member.status === "suspended" ? (
											<span className="badge badge-warn">
												{t.memberStatusName(member.status)}
											</span>
										) : (
											t.memberStatusName(member.status)
										)}
									</td>
									<td>
										<a href={`/?owner=${encodeURIComponent(member.id)}`}>
											{member.copies}
										</a>
									</td>
									<td>
										{member.lastSeenAt
											? when.format(member.lastSeenAt * 1000)
											: "—"}
									</td>
									<td className="row-actions">
										{actions.length || canSuspend ? (
											<RowMenu label={t.actionsFor(member.displayName)}>
												{actions.map(([role, label]) =>
													role === "self" ? (
														// Demoting yourself is a mistake more often than a plan: ask first.
														<a key={role} href="/admin/members?demote=self">
															{label}
														</a>
													) : (
														<form
															key={role}
															action={`/api/admin/members/${member.id}`}
															method="post"
															className="inline"
														>
															<input type="hidden" name="role" value={role} />
															<button type="submit" className="link">
																{label}
															</button>
														</form>
													),
												)}
												{canSuspend ? (
													<form
														action={`/api/admin/members/${member.id}`}
														method="post"
														className="inline"
													>
														<input
															type="hidden"
															name="status"
															value={
																member.status === "suspended"
																	? "active"
																	: "suspended"
															}
														/>
														<button type="submit" className="link">
															{member.status === "suspended"
																? t.reinstate
																: t.suspend}
														</button>
													</form>
												) : null}
											</RowMenu>
										) : null}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</main>
	);
}
