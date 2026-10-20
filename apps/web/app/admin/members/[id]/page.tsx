import { cookies } from "next/headers";
import type { AdminMemberDetail, MemberReport } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import { strings, type Locale, type Strings } from "../../../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../../../ui.tsx";
import { AdminTabs } from "../../tabs.tsx";
import { moderatorOrNull } from "../../guard.ts";
import { dateFormat } from "../../../../lib/dates.ts";
import { titled } from "../../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.members} · ${t.admin}`);

const memberHref = (id: string) => `/admin/members/${encodeURIComponent(id)}`;

/**
 * One member, for the moderators: who they are, how they came in, who they
 * brought, what was reported by or about them. The admin also sees the
 * whole chain of invitations that led to them.
 */
export default async function AdminMemberPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ error?: string }>;
}) {
	const { id } = await params;
	const { error } = await searchParams;
	const me = await moderatorOrNull();
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const page = await core<AdminMemberDetail>(
		`/v1/admin/members/${encodeURIComponent(id)}`,
	);
	if (page.status !== 200) return <Empty title={t.noSuchMember} />;
	const {
		member,
		invitedBy,
		invite,
		trail,
		openInvites,
		invited,
		reportsFiled,
		reportsAbout,
		loans,
	} = page.body;
	const date = dateFormat(locale, { dateStyle: "medium" });
	const memberAction = `/api/admin/members/${encodeURIComponent(member.id)}`;

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			{error === "erase-blocked" ? (
				<Callout tone="warn">{t.eraseBlocked}</Callout>
			) : error ? (
				<Callout tone="warn">{t.adminActionFailed}</Callout>
			) : null}
			<AdminTabs t={t} current="members" admin={me.role === "admin"} />
			<p className="muted">
				<a href="/admin/members">{t.allMembers}</a>
			</p>

			<section className="card member-card">
				<div>
					<h2>
						<bdi>{member.displayName}</bdi>{" "}
						<span
							className={`badge${member.role === "member" ? "" : " badge-ok"}`}
						>
							{member.role === "admin"
								? t.roleAdmin
								: member.role === "moderator"
									? t.roleModerator
									: t.roleMember}
						</span>{" "}
						{member.status === "active" ? null : (
							<span className="badge badge-warn">
								{t.memberStatusName(member.status)}
							</span>
						)}
					</h2>
					<dl className="facts">
						{member.email ? (
							<>
								<dt>{t.colEmail}</dt>
								<dd dir="ltr">{member.email}</dd>
							</>
						) : null}
						{me.community.compact ? null : (
							<>
								<dt>{t.colArea}</dt>
								<dd>
									<bdi>{member.areaLabel ?? "—"}</bdi>
								</dd>
							</>
						)}
						<dt>{t.memberJoined}</dt>
						<dd>{date.format(member.joinedAt * 1000)}</dd>
						<dt>{t.colLastSeen}</dt>
						<dd>
							{member.lastSeenAt ? date.format(member.lastSeenAt * 1000) : "—"}
						</dd>
						<dt>{t.colMeeting}</dt>
						<dd className="meeting-ready">
							{(
								[
									[member.hasMeetingPlace, t.meetingPlaceSet],
									[member.hasAvailability, t.availabilitySet],
								] as const
							).map(([set, label]) => (
								<span
									key={label}
									className={`badge${set ? " badge-ok" : " badge-missing"}`}
									title={set ? undefined : t.notSetYet}
								>
									{label}
									{set ? null : (
										<span className="sr-only"> ({t.notSetYet})</span>
									)}
								</span>
							))}
						</dd>
						<dt>{t.colCopies}</dt>
						<dd>
							<a href={`/?owner=${encodeURIComponent(member.id)}`}>
								{member.copies}
							</a>
						</dd>
						<dt>{t.memberLoans}</dt>
						<dd>
							{t.memberLoanCounts(loans.borrowed, loans.lent, loans.open)}
						</dd>
					</dl>
					<div className="actions">
						{/* A member is any moderator's to suspend; a moderator or the
						    admin is the admin's. Core holds the same line. */}
						{member.id !== me.id &&
						(member.role === "member" || me.role === "admin") ? (
							<form action={memberAction} method="post" className="inline">
								<input
									type="hidden"
									name="back"
									value={memberHref(member.id)}
								/>
								<input
									type="hidden"
									name="status"
									value={member.status === "suspended" ? "active" : "suspended"}
								/>
								<button type="submit" className="secondary">
									{member.status === "suspended" ? t.reinstate : t.suspend}
								</button>
							</form>
						) : null}
						{me.role === "admin" ? (
							<a
								href={`/admin/members?member=${encodeURIComponent(member.id)}`}
							>
								{t.changeRoleOrStatus}
							</a>
						) : null}
					</div>
				</div>
			</section>

			<h2>{t.cameInHow}</h2>
			{invitedBy ? (
				<p>
					{t.invitedByLabel}{" "}
					<a href={memberHref(invitedBy.id)}>
						<bdi>{invitedBy.displayName}</bdi>
					</a>
					{invite ? (
						<span className="muted">
							{" · "}
							{t.inviteLinkFacts(
								invite.createdBy.displayName,
								date.format(invite.createdAt * 1000),
								invite.uses,
								invite.maxUses,
							)}
						</span>
					) : null}
				</p>
			) : (
				<p className="muted">{t.noInviter}</p>
			)}

			{trail && trail.length > 1 ? (
				<>
					<h3>{t.inviteTrail}</h3>
					<p className="muted">{t.inviteTrailHint}</p>
					<ol className="trail">
						{trail.map((step) => (
							<li key={step.id}>
								<a href={memberHref(step.id)}>
									<bdi>{step.displayName}</bdi>
								</a>
								{step.joinedAt ? (
									<span className="muted">
										{" "}
										{date.format(step.joinedAt * 1000)}
									</span>
								) : null}
							</li>
						))}
					</ol>
				</>
			) : null}

			{openInvites ? (
				<>
					<h3>{t.openInvitesTitle}</h3>
					{openInvites.length ? (
						<>
							<ul className="plain-list">
								{openInvites.map((link) => (
									<li key={link.id} className="muted">
										{t.openInviteLine(
											date.format(link.createdAt * 1000),
											date.format(link.expiresAt * 1000),
											link.uses,
											link.maxUses,
										)}
									</li>
								))}
							</ul>
							<form action={memberAction} method="post" className="inline">
								<input
									type="hidden"
									name="back"
									value={memberHref(member.id)}
								/>
								<input type="hidden" name="invites" value="revoke" />
								<button type="submit" className="secondary">
									{t.revokeTheirInvites}
								</button>
							</form>
						</>
					) : (
						<p className="muted">{t.noOpenInvites}</p>
					)}
				</>
			) : null}

			<h2>{t.theyInvited}</h2>
			{invited.length ? (
				<ul className="plain-list">
					{invited.map((person) => (
						<li key={person.id}>
							<a href={memberHref(person.id)}>
								<bdi>{person.displayName}</bdi>
							</a>{" "}
							<span className="muted">
								{date.format(person.joinedAt * 1000)}
							</span>
						</li>
					))}
				</ul>
			) : (
				<p className="muted">{t.invitedNobody}</p>
			)}

			<h2>{t.reportsTheyFiled}</h2>
			<Reports list={reportsFiled} t={t} date={date} empty={t.noReportsFiled} />

			<h2>{t.reportsAboutThem}</h2>
			<Reports list={reportsAbout} t={t} date={date} empty={t.noReportsAbout} />

			{me.role === "admin" && member.id !== me.id ? (
				<section className="data-rights">
					<h2>{t.theirData}</h2>
					<p className="muted">{t.theirDataHint}</p>
					<form
						action={`${memberAction}/export`}
						method="post"
						className="inline"
						data-download=""
					>
						<button type="submit" className="secondary">
							{t.exportData}
						</button>
					</form>
					<details className="erase">
						<summary>{t.eraseMember}</summary>
						<form action={`${memberAction}/erase`} method="post">
							<p className="muted">{t.eraseHint}</p>
							<label htmlFor="erase-confirm">
								{t.eraseConfirm(member.displayName)}
							</label>
							<input
								id="erase-confirm"
								name="confirm"
								type="text"
								dir="auto"
								autoComplete="off"
								required
							/>
							<button type="submit" className="danger">
								{t.eraseButton}
							</button>
						</form>
					</details>
				</section>
			) : null}
		</main>
	);
}

function Reports({
	list,
	t,
	date,
	empty,
}: {
	list: MemberReport[];
	t: Strings;
	date: Intl.DateTimeFormat;
	empty: string;
}) {
	if (list.length === 0) return <p className="muted">{empty}</p>;
	return (
		<ul className="plain-list">
			{list.map((report) => (
				<li key={report.id}>
					<a href={`/admin/reports/${encodeURIComponent(report.id)}`}>
						{t.reportKindName(report.kind)}
					</a>{" "}
					<span
						className={`badge${report.status === "open" ? " badge-warn" : ""}`}
					>
						{t.reportStatusName(report.status)}
					</span>{" "}
					<span className="muted">
						{date.format(report.createdAt * 1000)}
						{report.other ? (
							<>
								{" · "}
								<a href={memberHref(report.other.id)}>
									<bdi>{report.other.displayName}</bdi>
								</a>
							</>
						) : null}
					</span>
				</li>
			))}
		</ul>
	);
}
