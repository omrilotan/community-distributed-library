import { cookies } from "next/headers";
import {
	SUGGESTED_ACCENTS,
	type AdminMember,
	type LibrarySettings,
} from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { library } from "../../../lib/library.ts";
import { formatDistance, strings, type Locale } from "../../../lib/i18n.ts";
import { AreaPicker } from "../../area-picker.tsx";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { AccentOwn } from "./accent-own.tsx";
import { adminOrNull } from "../guard.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.settingsTab} · ${t.admin}`);

/** What the library's admin decides for the library. The admin's alone. */
export default async function SettingsPage({
	searchParams,
}: {
	searchParams: Promise<{ saved?: string; error?: string }>;
}) {
	const me = await adminOrNull();
	const params = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.adminsOnly} />;

	const [settings, members, info] = await Promise.all([
		core<
			LibrarySettings & {
				centre: { label: string; lat: number; lng: number };
				radiusM: number;
			}
		>("/v1/admin/settings"),
		core<{ members: AdminMember[] }>("/v1/admin/members"),
		library(),
	]);
	if (settings.status !== 200) return <Empty title={t.adminActionFailed} />;
	const current = settings.body;
	// The library's colour is one of the named ones, or its own.
	const suggested = SUGGESTED_ACCENTS.some(
		(suggestion) => suggestion.hex === current.accent,
	);
	const admins =
		members.status === 200
			? members.body.members.filter(
					(member) => member.role === "admin" && member.status === "active",
				).length
			: 1;

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="settings" admin />
			{params.saved ? <Callout>{t.settingsSaved}</Callout> : null}
			{params.error ? (
				<Callout tone="warn">{t.adminActionFailed}</Callout>
			) : null}
			{admins < 2 ? (
				<Callout tone="warn">
					{t.onlyAdmin} <a href="/admin/members">{t.onlyAdminLink}</a>
				</Callout>
			) : null}

			<form
				action="/api/admin/settings"
				method="post"
				className="settings-form"
			>
				<p className="form-key">{t.requiredKey}</p>
				<label htmlFor="name">{t.settingsName}</label>
				<input
					id="name"
					name="name"
					type="text"
					dir="auto"
					maxLength={80}
					required
					defaultValue={current.name}
				/>

				<fieldset className="settings-words">
					<legend>{t.settingsWords}</legend>
					<p className="muted">{t.settingsWordsHint}</p>
					{info.languages.map((language) => {
						const text = current.texts?.[language] ?? {};
						const id = (field: string) => `text-${language}-${field}`;
						// The fields are in their language; the labels stay in the reader's.
						const own = {
							lang: language,
							dir: language === "he" ? "rtl" : "ltr",
						} as const;
						return (
							<fieldset key={language}>
								<legend lang={language}>
									{language === "he" ? "עברית" : "English"}
								</legend>
								<label htmlFor={id("name")}>{t.settingsTextName}</label>
								<input
									id={id("name")}
									name={id("name")}
									{...own}
									type="text"
									maxLength={80}
									defaultValue={text.name ?? ""}
									aria-describedby={id("name-hint")}
								/>
								<p className="muted" id={id("name-hint")}>
									{t.settingsTextNameHint}
								</p>
								<label htmlFor={id("shortName")}>{t.settingsShortName}</label>
								<input
									id={id("shortName")}
									name={id("shortName")}
									{...own}
									type="text"
									maxLength={20}
									defaultValue={text.shortName ?? ""}
									aria-describedby={id("shortName-hint")}
								/>
								<p className="muted" id={id("shortName-hint")}>
									{t.settingsShortNameHint}
								</p>
								<label htmlFor={id("tagline")}>{t.settingsTagline}</label>
								<textarea
									id={id("tagline")}
									name={id("tagline")}
									{...own}
									rows={3}
									maxLength={300}
									defaultValue={text.tagline ?? ""}
								/>
								<label htmlFor={id("about")}>{t.settingsAbout}</label>
								<textarea
									id={id("about")}
									name={id("about")}
									{...own}
									rows={4}
									maxLength={1000}
									defaultValue={text.about ?? ""}
								/>
							</fieldset>
						);
					})}
				</fieldset>

				{/* The library's own colour: one of the named ones, or any other.
				    Plain radios, so it works without a script; a script only
				    picks "your own" when its colour is changed. */}
				<fieldset className="accent-picker" aria-describedby="accent-hint">
					<legend>{t.settingsAccent}</legend>
					<p className="muted" id="accent-hint">
						{t.settingsAccentHint}
					</p>
					<div className="accent-swatches">
						{SUGGESTED_ACCENTS.map((suggestion) => {
							const house = "house" in suggestion;
							const value = house ? "house" : suggestion.hex;
							return (
								<label className="accent-swatch" key={suggestion.id}>
									<input
										type="radio"
										name="accentPick"
										value={value}
										defaultChecked={
											house ? !current.accent : current.accent === value
										}
									/>
									<span
										className="accent-chip"
										style={{ backgroundColor: suggestion.hex }}
										aria-hidden="true"
									/>
									<span>
										{t.accentName(suggestion.id)}
										{house ? (
											<span className="muted"> · {t.settingsAccentHouse}</span>
										) : null}
									</span>
								</label>
							);
						})}
						<label className="accent-swatch">
							<input
								type="radio"
								name="accentPick"
								value="own"
								id="accent-own"
								defaultChecked={Boolean(current.accent) && !suggested}
							/>
							<AccentOwn
								defaultValue={current.accent ?? SUGGESTED_ACCENTS[0].hex}
								radio="accent-own"
								label={t.settingsAccentOwn}
							/>
							<span>{t.settingsAccentOwn}</span>
						</label>
					</div>
				</fieldset>

				<label htmlFor="loanDays">{t.settingsLoanDays}</label>
				<input
					id="loanDays"
					name="loanDays"
					type="number"
					min={1}
					max={90}
					required
					dir="ltr"
					defaultValue={current.loanDays}
				/>

				<label htmlFor="memberInvitesOpen">{t.settingsInvitesOpen}</label>
				<input
					id="memberInvitesOpen"
					name="memberInvitesOpen"
					type="number"
					min={0}
					max={20}
					required
					dir="ltr"
					defaultValue={current.memberInvitesOpen}
				/>
				<p className="muted">{t.settingsInvitesOpenHint}</p>

				<label htmlFor="memberInviteDays">{t.settingsInviteDays}</label>
				<input
					id="memberInviteDays"
					name="memberInviteDays"
					type="number"
					min={1}
					max={30}
					required
					dir="ltr"
					defaultValue={current.memberInviteDays}
				/>

				<label htmlFor="languages">{t.settingsLanguages}</label>
				<select
					id="languages"
					name="languages"
					defaultValue={(current.languages ?? ["en", "he"]).join(",")}
				>
					<option value="en,he">{t.settingsLanguagesBoth}</option>
					<option value="en">{t.settingsLanguagesEn}</option>
					<option value="he">{t.settingsLanguagesHe}</option>
				</select>
				<p className="muted">{t.settingsLanguagesHint}</p>

				<label htmlFor="defaultLocale">{t.settingsLanguage}</label>
				<select
					id="defaultLocale"
					name="defaultLocale"
					defaultValue={current.defaultLocale}
				>
					<option value="en">English</option>
					<option value="he">עברית</option>
				</select>
				<p className="muted">{t.settingsLanguageHint}</p>

				<label htmlFor="compact">{t.settingsSize}</label>
				<select
					id="compact"
					name="compact"
					defaultValue={current.compact ? "1" : "0"}
				>
					<option value="0">{t.settingsSizeWide}</option>
					<option value="1">{t.settingsSizeCompact}</option>
				</select>
				<p className="muted">{t.settingsSizeHint}</p>

				{/* Where the library is, and how far it reaches: places members
				    type are looked up near it, and distances measured from it. */}
				<AreaPicker
					centre={{ lat: current.centre.lat, lng: current.centre.lng }}
					initial={current.centre}
					optional
					labels={{
						area: t.settingsCentre,
						areaHint: t.settingsCentreHint,
						locate: t.locate,
						located: t.located,
						locateFailed: t.locateFailed,
						mapHint: t.mapHint,
						mapMore: t.settingsCentreMap,
						you: t.settingsCentreMark,
					}}
				/>
				<label htmlFor="radiusM">{t.settingsRadius}</label>
				<select
					id="radiusM"
					name="radiusM"
					defaultValue={String(current.radiusM)}
				>
					{[
						...new Set([
							300,
							500,
							1000,
							2000,
							3000,
							5000,
							10000,
							20000,
							current.radiusM,
						]),
					]
						.sort((a, b) => a - b)
						.map((metres) => (
							<option key={metres} value={metres}>
								{formatDistance(locale, metres)}
							</option>
						))}
				</select>
				<p className="muted">{t.settingsRadiusHint}</p>

				<button type="submit" className="wide-on-phone">
					{t.save}
				</button>
			</form>
		</main>
	);
}
