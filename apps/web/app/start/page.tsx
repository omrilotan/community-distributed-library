import { cookies } from "next/headers";
import { getMe } from "../../lib/profile.ts";
import { strings, type Locale } from "../../lib/i18n.ts";
import { libraryWords } from "../../lib/library.ts";
import { requireSession } from "../../lib/session.ts";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.welcome);

/**
 * The first screen a new member sees: what this is, in three lines, and the
 * three short steps of setting up, each shown as it will look. The setup
 * itself goes one step at a time (start/setup).
 */
export default async function StartPage() {
	await requireSession();
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const me = await getMe();
	const community =
		me.status === 200
			? (await libraryWords(locale)).name || me.body.community.name
			: t.appShort;
	const compact = me.status === 200 && me.body.community.compact;

	// What each step looks like, captured from the real screens.
	const steps: [string, string, string | null][] = [
		compact
			? [t.setupNameTitle, t.setupNameHint, null]
			: [t.setupAreaTitle, t.setupAreaHint, `/start/area-${locale}.jpg`],
		[t.setupPlaceTitle, t.setupPlaceHint, `/start/place-${locale}.jpg`],
		[t.setupTimesTitle, t.setupTimesHint, `/start/times-${locale}.jpg`],
	];

	return (
		<main className="narrow start" style={{ maxInlineSize: "34rem" }}>
			<h1>{t.startTitle(community)}</h1>
			<p className="lede">{t.startLede}</p>
			<ul className="start-how">
				{t.startHow.map(([heading, line]) => (
					<li key={heading}>
						<strong>{heading}</strong> <span className="muted">{line}</span>
					</li>
				))}
			</ul>

			<h2>{t.startSetupTitle}</h2>
			<ol className="steps start-setup">
				{steps.map(([heading, body, image], index) => (
					<li key={heading}>
						<span className="steps-number" aria-hidden="true">
							{index + 1}
						</span>
						<div>
							<strong>{heading}</strong>
							<p className="muted">{body}</p>
							{image ? (
								<img
									className="start-shot"
									src={image}
									alt=""
									loading="lazy"
									width={390}
								/>
							) : null}
						</div>
					</li>
				))}
			</ol>

			<p className="actions start-go">
				<a className="btn" href="/start/setup">
					{t.startContinue}
				</a>
			</p>
			<p className="muted cookie-note">
				{t.cookieNote} <a href="/terms">{t.terms}</a>
			</p>
		</main>
	);
}
