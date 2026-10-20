import { cookies } from "next/headers";
import type { InviteSummary } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { CopyButton } from "../../copy-button.tsx";
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
	const newInvite = (await shownOnce("batch-invite"))?.url;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const invites = await core<{ invites: InviteSummary[] }>("/v1/admin/invites");
	const now = Math.floor(Date.now() / 1000);
	const when = dateFormat(locale, { dateStyle: "medium" });
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
					<p>{t.inviteCreated}</p>
					<CopyButton
						value={newInvite}
						labels={{ copy: t.copy, copied: t.copied }}
						block
					/>
				</div>
			) : null}
			<form action="/api/admin/invites" method="post" className="row">
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
				<label>
					{t.inviteDays}
					<input name="days" type="number" min={1} max={30} defaultValue={7} />
				</label>
				<button type="submit">{t.inviteCreate}</button>
			</form>
			<p className="muted">{t.inviteHint}</p>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>{t.colCreatedBy}</th>
							<th>{t.colSentTo}</th>
							<th>{t.colUses}</th>
							<th>{t.colExpires}</th>
							<th>{t.colStatus}</th>
							<th />
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
									<td>{when.format(invite.expiresAt * 1000)}</td>
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
