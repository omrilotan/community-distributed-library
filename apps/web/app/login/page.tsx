import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { strings, type Locale } from "../../lib/i18n.ts";
import { getMe } from "../../lib/profile.ts";
import { sessionToken } from "../../lib/session.ts";
import { backAfterSignIn } from "../../lib/safe-path.ts";
import { signInBack } from "../../lib/sign-in.ts";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.signIn);

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{
		sent?: string;
		invite?: string;
		error?: string;
		wait?: string;
		dev?: string;
		back?: string;
	}>;
}) {
	const { sent, invite, error, dev, wait, back } = await searchParams;
	// Where to go once signed in, such as an assistant's consent screen.
	const after = backAfterSignIn(back);
	// Already in: the door is not the place to stand. A stale cookie stays
	// here to sign in again; a failing core stays here too, rather than loop.
	if (await sessionToken()) {
		const me = await getMe().catch(() => null);
		if (me?.status === 200) redirect(after ?? "/");
	}
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	// Asking again keeps the way back the first ask set (lib/sign-in.ts).
	const again = sent ? await signInBack() : null;

	return (
		<main className="narrow">
			<h1>{t.signIn}</h1>
			{/* Somebody who has no invitation should learn that here, not after
			    asking for a link that never comes. */}
			{sent ? null : <p className="muted">{t.landingInvite}</p>}
			{sent ? (
				// What to do now, in one line: tap the link. The code below is for
				// the email opening somewhere else, and says so itself.
				<div className="callout">
					<p>
						<strong>{t.linkSentTitle}</strong>
					</p>
					<p>{t.linkSent}</p>
				</div>
			) : null}
			{dev === "unknown_email" ? (
				<p className="muted">
					Development: that address is not a member in the local database.
					Seeded accounts:
					<code> dana@example.com</code> (moderator),{" "}
					<code>sam@example.com</code>.
				</p>
			) : null}
			{error === "rate" ? (
				<p className="callout callout-warn">
					{t.tooManyLinks(Math.ceil((Number(wait) || 900) / 60))}
				</p>
			) : null}
			{error === "code" ? (
				<p className="callout callout-warn">{t.signInCodeFailed}</p>
			) : null}
			{error && error !== "rate" && error !== "code" ? (
				<p className="callout callout-warn">{t.linkFailed}</p>
			) : null}
			{sent ? (
				// For a browser the email's link cannot reach, such as an app's
				// sign-in window: the code works here, in the browser that asked.
				<form action="/api/auth/code" method="post" className="sign-in-code">
					<label htmlFor="code">{t.signInCodeLabel}</label>
					<input
						id="code"
						name="code"
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9 -]{8,10}"
						maxLength={10}
						dir="ltr"
					/>
					<button type="submit">{t.signInCodeSubmit}</button>
				</form>
			) : null}
			{sent ? (
				<>
					{/* The first link very often lands in junk, and people give up
					    before looking there. So this is the loudest thing on the
					    page, with the fix for next time beside it. */}
					<div className="callout callout-warn junk-warning" role="alert">
						<p>
							<strong>{t.checkJunk}</strong>
						</p>
						<p>
							<a href="/contact.vcf" download>
								{t.saveContact}
							</a>{" "}
							{t.saveContactWhy}
						</p>
					</div>
					{/* No second address field: under a code, it reads as "do it
					    again". Asking anew is a quiet link back to the form. */}
					<p className="muted">
						{t.linkNeedsInvite}{" "}
						<a
							href={
								again ? `/login?back=${encodeURIComponent(again)}` : "/login"
							}
						>
							{t.sendNewLink}
						</a>
					</p>
				</>
			) : (
				<form action="/api/auth/magic-link" method="post">
					{invite ? <input type="hidden" name="invite" value={invite} /> : null}
					{after ? <input type="hidden" name="back" value={after} /> : null}
					<input type="hidden" name="locale" value={locale} />
					<label htmlFor="email">{t.email}</label>
					<input
						id="email"
						name="email"
						type="email"
						inputMode="email"
						dir="ltr"
						required
					/>
					<button type="submit">{t.sendLink}</button>
				</form>
			)}
			{/* Agreed to before the link was asked for; not said again after. */}
			{sent ? null : (
				<>
					<p className="muted">
						{t.termsHint} <a href="/terms">{t.terms}</a>
					</p>
					<p className="muted cookie-note">{t.cookieNote}</p>
				</>
			)}
		</main>
	);
}
