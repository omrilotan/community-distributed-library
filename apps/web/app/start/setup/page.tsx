import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Availability } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { getMe } from "../../../lib/profile.ts";
import { libraryWords } from "../../../lib/library.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { requireSession, signedOut } from "../../../lib/session.ts";
import { AreaPicker, MEMBER_REACH_M } from "../../area-picker.tsx";
import { Callout } from "../../ui.tsx";
import { WeekGrid } from "../../settings/availability.tsx";
import { SetupProgress } from "../setup-progress.tsx";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.welcome);

/**
 * A new member's setup, one thing per screen: name and area, where they
 * meet, when they can. Then the shelves, to find something to borrow.
 * Each screen saves on its own, so leaving half-way loses nothing.
 */
export default async function SetupPage({
	searchParams,
}: {
	searchParams: Promise<{ step?: string; error?: string }>;
}) {
	await requireSession();
	const { step: asked, error } = await searchParams;
	const step = Math.min(Math.max(Number(asked) || 1, 1), 3);
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const me = await getMe();
	if (me.status !== 200) signedOut(me.status);
	const { body } = me;
	// Nothing past the first screen works without an area.
	// Everyone close by: no area to ask for, so only a name on the first step.
	const compact = body.community.compact;
	if (step > 1 && !body.area && !compact) redirect("/start/setup?step=1");
	const availability =
		step > 1 ? await core<Availability>("/v1/me/availability") : null;
	const current: Availability =
		availability?.status === 200
			? availability.body
			: { slots: [], meetingPlace: null };
	const next = `/start/setup?step=${step + 1}`;
	// The whole welcome: one line, over the first step.
	const community =
		step === 1
			? (await libraryWords(locale)).name || body.community.name
			: null;

	return (
		<main className="narrow setup" style={{ maxInlineSize: "34rem" }}>
			{community ? <p className="lede">{t.startTitle(community)}</p> : null}
			<SetupProgress step={step} t={t} />
			{error ? (
				<Callout tone="warn">
					{error === "area" ? t.areaMissing : t.adminActionFailed}
				</Callout>
			) : null}

			{step === 1 ? (
				<form action="/api/me/setup" method="post">
					<input type="hidden" name="step" value={compact ? "name" : "area"} />
					<h1>{compact ? t.setupNameTitle : t.setupAreaTitle}</h1>
					<p className="muted">{compact ? t.setupNameHint : t.setupAreaHint}</p>
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
					{compact ? null : (
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
					<p className="actions">
						<button type="submit">{t.setupNext}</button>
					</p>
				</form>
			) : null}

			{step === 2 ? (
				<form action="/api/me/setup" method="post">
					<input type="hidden" name="step" value="place" />
					<h1>{t.setupPlaceTitle}</h1>
					<p>{t.setupPlaceHint}</p>
					<label htmlFor="meetingPlace">{t.meetingPlace}</label>
					<input
						id="meetingPlace"
						name="meetingPlace"
						type="text"
						dir="auto"
						maxLength={120}
						defaultValue={current.meetingPlace ?? ""}
						placeholder={t.meetingPlaceHint}
					/>
					<p className="muted">{t.meetingPlacePrivacy}</p>
					<p className="actions">
						<button type="submit">{t.setupNext}</button>
						<a href={next}>{t.setupLater}</a>
					</p>
				</form>
			) : null}

			{step === 3 ? (
				<form action="/api/me/setup" method="post">
					<input type="hidden" name="step" value="times" />
					<h1>{t.setupTimesTitle}</h1>
					<p className="muted">{t.setupTimesHint}</p>
					<WeekGrid value={current} t={t} />
					<p className="actions">
						<button type="submit">{t.setupNext}</button>
						<a href="/">{t.setupLater}</a>
					</p>
				</form>
			) : null}
		</main>
	);
}
