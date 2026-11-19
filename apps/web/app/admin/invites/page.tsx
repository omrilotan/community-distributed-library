import { cookies } from "next/headers";
import type { InviteSummary } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { LinkReady } from "../../link-ready.tsx";
import { library, libraryWords } from "../../../lib/library.ts";
import { brandColours } from "../../../lib/accent.ts";
import { LIBRARY_TIME_ZONE, libraryToday } from "../../../lib/calendar.ts";
import { whenLine } from "../../../lib/sign.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { moderatorOrNull } from "../guard.ts";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";
import { shownOnce } from "../../../lib/shown-once.ts";

export const generateMetadata = titled((t) => `${t.invites} · ${t.admin}`);

export default async function AdminInvites({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; sent?: string }>;
}) {
	const me = await moderatorOrNull();
	const { error, sent } = await searchParams;
	// Made a moment ago, shown this once (never from the address).
	const newInvite = await shownOnce("batch-invite");
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;
	const words = await libraryWords(locale);
	const { accent } = await library();
	const today = libraryToday();
	const zone = LIBRARY_TIME_ZONE;
	/** An event's link is one day's when it is open for about a day. */
	const oneDay = (one: { startsAt?: number | null; expiresAt: number }) =>
		one.startsAt != null && one.expiresAt - one.startsAt <= 25 * 3600;

	const invites = await core<{ invites: InviteSummary[] }>("/v1/admin/invites");
	const now = Math.floor(Date.now() / 1000);
	const when = dateFormat(locale, { dateStyle: "medium" });
	const time = dateFormat(locale, { timeStyle: "short" });
	const rows = invites.status === 200 ? invites.body.invites : [];

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="invites" admin={me.role === "admin"} />
			{error ? (
				<Callout tone="warn">
					{error === "member"
						? t.inviteAlreadyMember
						: error === "rate"
							? t.inviteEmailRate
							: error === "date"
								? t.inviteDateInvalid
								: error === "gone"
									? t.inviteLinkGone
									: t.adminActionFailed}
				</Callout>
			) : null}
			{sent ? <Callout>{t.inviteEmailSent}</Callout> : null}

			{/* Straight to their inbox: the quickest way in, nothing to forward. */}
			<h2>{t.inviteByEmail}</h2>
			<form action="/api/admin/invites/email" method="post" className="row">
				<label>
					{t.email}
					<input
						name="email"
						type="email"
						inputMode="email"
						dir="ltr"
						autoComplete="off"
						required
					/>
				</label>
				<button type="submit">{t.inviteEmailSend}</button>
			</form>
			<p className="muted">{t.inviteByEmailHint}</p>

			<h2>{t.inviteLinkTitle}</h2>
			{newInvite ? (
				<div className="callout">
					<p>{newInvite.showable ? t.inviteCreatedKept : t.inviteCreated}</p>
					<LinkReady
						url={newInvite.url}
						message={t.inviteMessage(me.community.name)}
						filename="join"
						note={
							newInvite.startsAt != null &&
							oneDay({
								startsAt: newInvite.startsAt,
								expiresAt: newInvite.expiresAt,
							})
								? t.inviteWorksOn(t.inviteDay(newInvite.startsAt), zone)
								: t.inviteWorksUntil(
										when.format(newInvite.expiresAt * 1000) +
											" " +
											time.format(newInvite.expiresAt * 1000),
									)
						}
						labels={{
							share: t.share,
							copy: t.copyLink,
							copied: t.linkCopied,
							showQr: t.showQr,
							hideQr: t.hideQr,
							qrAlt: t.inviteQrAlt,
							downloadPng: t.downloadPng,
							downloadSvg: t.downloadSvg,
						}}
						sign={{
							spec: {
								colour: brandColours(accent).light,
								rtl: locale === "he",
								words: {
									name: words.name || me.community.name,
									tagline: words.tagline,
									scan: t.signScan,
									when: whenLine(
										{
											startsAt: newInvite.startsAt ?? null,
											expiresAt: newInvite.expiresAt,
										},
										{
											todayOnly: t.signTodayOnly,
											joinBy: t.signJoinBy,
											day: t.inviteDay,
										},
									),
									foldHint: t.signFold,
									madeWith: t.signMadeWith,
									glue: t.signGlue,
								},
							},
							labels: {
								make: t.signMake,
								hint: newInvite.showable
									? t.signHint
									: `${t.signHint} ${t.signNow}`,
								downloadPdf: t.signPdf,
								downloadPng: t.downloadPng,
								preview: t.signPreview,
								failed: t.signFailed,
							},
						}}
					/>
				</div>
			) : null}
			<p className="muted">{t.inviteEventWhy}</p>
			<form action="/api/admin/invites" method="post" className="invite-batch">
				<label>
					{t.inviteUses}
					<input
						name="maxUses"
						type="number"
						min={1}
						max={50}
						defaultValue={5}
					/>
				</label>
				<fieldset className="invite-when">
					<label className="choice">
						<input type="radio" name="mode" value="days" defaultChecked />
						{t.inviteModeDays}
					</label>
					<label>
						{t.inviteDays}
						<input
							name="days"
							type="number"
							min={1}
							max={30}
							defaultValue={7}
						/>
					</label>
					<label className="choice">
						<input type="radio" name="mode" value="date" />
						{t.inviteModeDate}
					</label>
					<label>
						{t.inviteDate}
						<input name="date" type="date" min={today} defaultValue={today} />
					</label>
					<p className="muted">{t.inviteDayZone(zone)}</p>
				</fieldset>
				<button type="submit">{t.inviteCreate}</button>
			</form>
			<p className="muted">{t.inviteHint}</p>
			<div
				className="table-wrap"
				tabIndex={0}
				role="region"
				aria-label={t.invites}
			>
				<table>
					<thead>
						<tr>
							<th scope="col">{t.colCreatedBy}</th>
							<th scope="col">{t.colSentTo}</th>
							<th scope="col">{t.colUses}</th>
							<th scope="col">{t.colExpires}</th>
							<th scope="col">{t.colStatus}</th>
							<th scope="col">
								<span className="sr-only">{t.manage}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((invite) => {
							const live =
								!invite.revokedAt &&
								invite.expiresAt > now &&
								invite.uses < invite.maxUses;
							return (
								<tr key={invite.id}>
									<td>
										<bdi>{invite.createdBy}</bdi>
									</td>
									<td dir="ltr">{invite.sentTo ?? ""}</td>
									<td dir="ltr">
										{invite.uses}/{invite.maxUses}
									</td>
									<td>
										{oneDay(invite) && invite.startsAt != null
											? t.inviteOnlyOn(t.inviteDay(invite.startsAt))
											: when.format(invite.expiresAt * 1000)}
									</td>
									<td>
										<span className={`badge${live ? " badge-ok" : ""}`}>
											{invite.revokedAt
												? t.inviteRevoked
												: live
													? t.inviteLive
													: t.inviteSpent}
										</span>
									</td>
									<td>
										<div className="invite-row-actions">
											{invite.showable ? (
												<form
													action={`/api/admin/invites/${invite.id}/link`}
													method="post"
													className="inline"
												>
													<button type="submit" className="link">
														{t.inviteShowLink}
													</button>
												</form>
											) : null}
											{live ? (
												<form
													action={`/api/admin/invites/${invite.id}/revoke`}
													method="post"
													className="inline"
												>
													<button type="submit" className="link">
														{t.revoke}
													</button>
												</form>
											) : null}
										</div>
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
