import { cookies } from "next/headers";
import { getMe } from "../../lib/profile.ts";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { Robot } from "@phosphor-icons/react/dist/ssr/Robot";
import {
	SCOPE_DESCRIPTIONS,
	type Availability,
	type MemberStats,
	type MyInvite,
	type TokenSummary,
} from "@cdl/contracts";
import { AvailabilityFields } from "./availability.tsx";
import { PushToggle } from "../push-toggle.tsx";
import { pushLabels } from "../../lib/push-labels.ts";
import { InviteForm } from "../invite-form.tsx";
import { Stats } from "../stats.tsx";
import { core } from "../../lib/core.ts";
import { strings, type Locale } from "../../lib/i18n.ts";
import { requireSession, signedOut } from "../../lib/session.ts";
import { AreaPicker, MEMBER_REACH_M } from "../area-picker.tsx";
import { Callout } from "../ui.tsx";
import { UnsavedGuard } from "../unsaved-guard.tsx";
import { dateFormat } from "../../lib/dates.ts";
import { library } from "../../lib/library.ts";
import { titled } from "../../lib/page-title.ts";
import { shownOnce } from "../../lib/shown-once.ts";

export const generateMetadata = titled((t) => t.profile);

/**
 * First sign-in, and the place to change it later: a name and a rough area.
 * The area is required — distance is what makes the storefront useful.
 * Then, in order: when and where you meet, away until, invitations,
 * notifications, how many out at once and the language, one Save for all of
 * it, and the rest.
 */
export default async function SettingsPage({
	searchParams,
}: {
	searchParams: Promise<{
		error?: string;
		area?: string;
		revoked?: string;
		saved?: string;
		first?: string;
		withdrawn?: string;
		invite?: string;
	}>;
}) {
	await requireSession();
	const {
		first,
		error,
		area: needsArea,
		revoked,
		saved,
		withdrawn,
		invite,
	} = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const offered = (await library()).languages;
	const me = await getMe();
	if (me.status !== 200) signedOut(me.status);
	const { body } = me;
	// Set up: an area given, or none needed where everyone lives close by.
	const ready = Boolean(body.area) || body.community.compact;
	const tokens = ready
		? await core<{ tokens: TokenSummary[] }>("/v1/me/tokens")
		: null;
	const availability = ready
		? await core<Availability>("/v1/me/availability")
		: null;
	const invites = ready
		? await core<{ invites: MyInvite[] }>("/v1/me/invites")
		: null;
	const myInvites = invites?.status === 200 ? invites.body.invites : [];
	const figures = ready ? await core<MemberStats>("/v1/me/stats") : null;
	const stats = figures?.status === 200 ? figures.body : null;
	const apps = tokens?.status === 200 ? tokens.body.tokens : [];
	const when = dateFormat(locale, { dateStyle: "medium" });

	return (
		<main className="narrow" style={{ maxInlineSize: "34rem" }}>
			<h1>{ready ? t.profile : t.welcome}</h1>
			<p className="muted">{t.welcomeHint}</p>
			{/* The account's own doors, first: another device, an assistant. Not
			    on a first visit, which is only about name and area. */}
			{ready ? (
				<nav className="quick-links" aria-label={t.profileQuick}>
					<a href="/device">
						<DeviceMobile size={20} aria-hidden="true" />
						{t.deviceTitle}
					</a>
					<a href="/connect">
						<Robot size={20} aria-hidden="true" />
						{t.connect}
					</a>
				</nav>
			) : null}
			{saved ? <Callout>{t.saved}</Callout> : null}
			{needsArea ? <p className="callout">{t.areaRequired}</p> : null}
			{error === "area" ? <p className="callout">{t.areaMissing}</p> : null}
			{error && error !== "area" ? (
				<p className="callout">{t.adminActionFailed}</p>
			) : null}

			<UnsavedGuard />
			{/* One form, one Save. The invitations and notifications sit inside its
			    run of fields but act at once, so they stay outside it; the fields
			    after them join it by its id. */}
			<form id="profile" action="/api/me" method="post" data-unsaved>
				{first ? <input type="hidden" name="first" value="1" /> : null}
				<p className="form-key">{t.requiredKey}</p>
				<label htmlFor="displayName">{t.displayName}</label>
				<input
					id="displayName"
					name="displayName"
					type="text"
					dir="auto"
					required
					defaultValue={body.displayName}
				/>

				{body.community.compact ? (
					<input type="hidden" name="noArea" value="1" />
				) : (
					<AreaPicker
						centre={body.community.centre}
						reach={MEMBER_REACH_M}
						initial={body.area ?? null}
						labels={{
							area: t.areaLabel,
							areaHint: t.areaLabelHint,
							locate: t.locate,
							located: t.located,
							locatedNoName: t.locatedNoName,
							locatedFar: t.locatedFar,
							locateFailed: t.locateFailed,
							mapHint: t.mapHint,
							mapMore: t.mapMore,
							you: t.you,
						}}
					/>
				)}

				{ready && availability?.status === 200 ? (
					<section id="availability">
						<h2>{t.availabilityTitle}</h2>
						<input type="hidden" name="withAvailability" value="1" />
						<AvailabilityFields value={availability.body} t={t} />
					</section>
				) : null}

				{/* A holiday, a house move, a bad week: everything stays listed and
				    nobody can ask for it until the day given. */}
				<label htmlFor="awayUntil">{t.awayUntil}</label>
				<input
					id="awayUntil"
					name="awayUntil"
					type="date"
					dir="ltr"
					defaultValue={
						body.awayUntil
							? new Date(body.awayUntil * 1000).toISOString().slice(0, 10)
							: ""
					}
				/>
				<p className="muted">{body.awayUntil ? t.awayNowHint : t.awayHint}</p>
			</form>

			<section id="invite">
				<h2>{t.inviteTitle}</h2>
				{withdrawn ? <Callout>{t.inviteWithdrawn}</Callout> : null}
				<p className="muted">{t.inviteWhy}</p>
				<InviteForm
					made={await shownOnce("invite")}
					failure={invite === "many" || invite === "failed" ? invite : null}
					message={t.inviteMessage(body.community.name)}
					labels={{
						create: t.inviteLinkCreate,
						another: t.inviteAnother,
						creating: t.inviteCreating,
						failed: t.inviteFailed,
						tooMany: t.inviteTooMany,
						shownOnce: t.inviteShownOnce,
						copy: t.copyLink,
						copied: t.linkCopied,
						share: t.share,
					}}
				/>
				{myInvites.length ? (
					<ul className="hooks">
						{myInvites.map((one) => (
							<li key={one.id}>
								<div className="muted">
									{one.joined.length ? (
										<>
											{t.inviteJoined}{" "}
											{one.joined.map((who: MyInvite["joined"][number]) => (
												<bdi key={who.id}>{who.displayName}</bdi>
											))}
										</>
									) : (
										t.inviteWaiting(
											Math.max(
												0,
												Math.ceil((one.expiresAt - Date.now() / 1000) / 86400),
											),
										)
									)}
								</div>
								{one.joined.length ? null : (
									<form
										action={`/api/me/invites/${one.id}`}
										method="post"
										className="inline"
									>
										<button type="submit" className="link">
											{t.inviteWithdraw}
										</button>
									</form>
								)}
							</li>
						))}
					</ul>
				) : null}
			</section>

			<section>
				<h2>{t.notifications}</h2>
				<PushToggle labels={pushLabels(t)} />
			</section>

			<section>
				<h2>{t.profilePrefs}</h2>
				<label htmlFor="lendLimit">{t.lendLimit}</label>
				<input
					id="lendLimit"
					name="lendLimit"
					form="profile"
					type="number"
					inputMode="numeric"
					min="1"
					max="999"
					dir="ltr"
					defaultValue={body.lendLimit ?? ""}
					placeholder={t.lendLimitAny}
				/>
				<p className="muted">{t.lendLimitHint}</p>

				{/* The library's languages only: a library in one has no choice
				    to offer, and its emails come in that one. */}
				{offered.length > 1 ? (
					<>
						<label htmlFor="locale">{t.language}</label>
						<select
							id="locale"
							name="locale"
							form="profile"
							defaultValue={locale}
						>
							{offered.includes("en") ? (
								<option value="en">English</option>
							) : null}
							{offered.includes("he") ? (
								<option value="he">עברית</option>
							) : null}
						</select>
					</>
				) : (
					<input
						type="hidden"
						name="locale"
						form="profile"
						value={offered[0] ?? locale}
					/>
				)}
			</section>

			<button type="submit" form="profile" className="profile-save">
				{t.save}
			</button>

			{stats ? (
				<section>
					<h2>{t.statsTitle}</h2>
					<Stats
						items={[
							[t.statBooks, String(stats.books)],
							[t.statLoans, String(stats.lent)],
							[t.statReaders, String(stats.readers)],
							[t.statBorrowed, String(stats.borrowed)],
							[t.statOutNow, String(stats.outNow)],
							[t.statMemberSince, when.format(stats.memberSince * 1000)],
						]}
					/>
					<p className="muted">{t.statsPrivate}</p>
				</section>
			) : null}

			{ready ? (
				<section>
					<h2>{t.connectedApps}</h2>
					{revoked ? <Callout>{t.appRevoked}</Callout> : null}
					<p className="muted">
						<a href="/connect">{t.connect}</a>
					</p>
					{apps.length === 0 ? <p className="muted">{t.noApps}</p> : null}
					{apps.map((app) => (
						<article className="card" key={app.id}>
							<div>
								<bdi>
									<strong>{app.clientName}</strong>
								</bdi>
								<div className="muted">
									{app.scopes
										.map((scope) => SCOPE_DESCRIPTIONS[scope][locale])
										.join(" · ")}
								</div>
								<div className="muted">
									{t.connectedOn(when.format(app.createdAt * 1000))}
									{app.lastUsedAt
										? ` · ${t.lastUsed(when.format(app.lastUsedAt * 1000))}`
										: ""}
								</div>
								<form
									action={`/api/me/tokens/${app.id}`}
									method="post"
									className="inline"
								>
									<button type="submit" className="link">
										{t.disconnect}
									</button>
								</form>
							</div>
						</article>
					))}
				</section>
			) : null}
		</main>
	);
}
