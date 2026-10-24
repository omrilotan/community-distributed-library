import type { Metadata } from "next";
import { getMe } from "../lib/profile.ts";
import { cookies, headers } from "next/headers";
// Heebo, served from this site (no third party sees a visitor, and the CSP's
// font-src 'self' covers it). The browser fetches only the ranges a page uses.
import "@fontsource-variable/heebo";
import "./globals.css";
import { direction, locales, strings, type Locale } from "../lib/i18n.ts";
import { library, libraryWords } from "../lib/library.ts";
import { accentCss, brandColours, iconHref } from "../lib/accent.ts";
import { libraryType } from "../lib/library-type.ts";
import { appBase, imagesOrigin } from "../lib/site.ts";
import { cardHref } from "../lib/card-href.ts";
import { sessionToken } from "../lib/session.ts";
import { moderates, viewingAsMember } from "../lib/view-as.ts";
import { NavLink } from "./nav-link.tsx";
import { Tabs } from "./tabs.tsx";
import { Menu } from "./menu.tsx";
import { ServiceWorker } from "./service-worker.tsx";
import { FormGuard } from "./form-guard.tsx";

/** Every page's defaults; the title is the library's name in the reader's language. */
export async function generateMetadata(): Promise<Metadata> {
	const requested = (await cookies()).get("locale")?.value;
	const locale: Locale = locales.includes(requested as Locale)
		? (requested as Locale)
		: "en";
	const words = await libraryWords(locale);
	const title = words.name || strings(locale).appShort;
	const description = words.tagline || strings(locale).ogTagline;
	// A shared link shows a card: the library's name, its line and its mark in
	// its colour. A page with its own card (a book) replaces this one.
	const image = await cardHref(locale);
	return {
		title,
		description,
		openGraph: {
			type: "website",
			siteName: title,
			title,
			description,
			url: `${appBase()}/`,
			images: [{ url: image, width: 1200, height: 630, alt: title }],
		},
		twitter: { card: "summary_large_image" },
	};
}

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const store = await cookies();
	// The middleware minted a nonce for this request; our own inline script
	// has to carry it or the policy will stop it.
	const sent = await headers();
	const nonce = sent
		.get("content-security-policy")
		?.match(/'nonce-([^']+)'/)?.[1];
	// The same as the header, in the page, for anything that reads only HTML.
	const robots = sent.get("x-cdl-robots") ?? "noindex, nofollow";
	const requested = store.get("locale")?.value;
	const locale: Locale = locales.includes(requested as Locale)
		? (requested as Locale)
		: "en";
	const t = strings(locale);
	const words = await libraryWords(locale);
	// A library in one language has nothing to switch to.
	const info = await library();
	const bilingual = info.languages.length > 1;
	// The library's own colour, over the house green.
	const accent = accentCss(info.accent);
	const images = imagesOrigin();
	const hasSession = Boolean(await sessionToken());
	const me = hasSession ? await getMe().catch(() => null) : null;
	// A cookie whose session was ended (signed out elsewhere, suspended,
	// erased) is no sign-in: such a visitor gets the signed-out page, so the
	// contact form and sign-in link are where they look for them.
	const signedIn = hasSession && me?.status !== 401;
	const moderator = me?.status === 200 && moderates(me.body.role);
	// A moderator may ask to see the library the way a member does.
	const asMember = moderator && (await viewingAsMember());
	const isModerator = moderator && !asMember;
	const attention = me?.status === 200 ? me.body.attention : 0;
	const moderation = me?.status === 200 ? me.body.moderation : 0;

	return (
		<html
			lang={locale}
			dir={direction(locale)}
			// What the library lends: a thing's pictures are square, a book's tall.
			data-library={libraryType()}
		>
			<head>
				{/* The covers come off their own host: open the way there while the
				    stylesheet is still on its way, so the first cover does not wait
				    for a handshake. */}
				{images ? <link rel="preconnect" href={images} /> : null}
				<meta name="robots" content={robots} />
				{/* Written here, not in the metadata: vinext streams that into the
				    body, and Chrome sees no manifest outside the head, so it never
				    offers to install. */}
				<link rel="manifest" href="/manifest.webmanifest" />
				<link
					rel="icon"
					href={iconHref("/favicon.ico", info.accent)}
					sizes="any"
				/>
				<link
					rel="icon"
					href={iconHref("/favicon.svg", info.accent)}
					type="image/svg+xml"
				/>
				<link
					rel="apple-touch-icon"
					href={iconHref("/apple-touch-icon.png", info.accent)}
				/>
				{/* The installed app's bars, in the library's colour at once: the
				    manifest's colour waits for the phone to fetch it again. A tab
				    in the browser keeps the browser's own. */}
				<meta
					name="theme-color"
					media="(display-mode: standalone)"
					content={brandColours(info.accent).light}
				/>
				{accent ? <style dangerouslySetInnerHTML={{ __html: accent }} /> : null}
				{/* Installing it is what makes notifications possible on iOS. */}
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="mobile-web-app-capable" content="yes" />
				<meta
					name="apple-mobile-web-app-title"
					content={words.shortName ?? t.appShort}
				/>
			</head>
			<body>
				{/* First thing a keyboard reaches: past the header, to the page. */}
				<a className="skip" href="#main">
					{t.skipToContent}
				</a>
				{/* Chrome fires this before React is listening, so catch it here
				    and let the menu read it when it mounts. */}
				<script
					nonce={nonce}
					dangerouslySetInnerHTML={{
						__html:
							"addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e});",
					}}
				/>
				{/* A cover moves only between its tile and its own page. Any other
				    change, like a choice in Filters, swaps the page at once: covers
				    sliding to new places would cross over the open panel. */}
				<script
					nonce={nonce}
					dangerouslySetInnerHTML={{
						__html:
							"addEventListener('pageswap',function(e){var t=e.viewTransition,a=e.activation;if(t&&!(a&&[a.from,a.entry].some(function(h){return h&&/^\\/works\\//.test(new URL(h.url).pathname)})))(t.ready.catch(function(){}),t.skipTransition())});",
					}}
				/>
				<ServiceWorker />
				<FormGuard />
				<header className="topbar">
					<div className="topbar-inner">
						<a className="brand" href="/">
							<span className="brand-long">{words.name || t.appShort}</span>
							<span className="brand-short">
								{words.shortName ?? t.appShort}
							</span>
						</a>
						{/* Only when there is somewhere to go: an empty landmark is noise. */}
						{signedIn ? (
							<nav className="nav nav-main" aria-label={t.mainNav}>
								<NavLink href="/">{t.browse}</NavLink>
								<NavLink href="/shelf">{t.shelf}</NavLink>
								<NavLink href="/loans">
									{t.loans}
									{attention ? (
										<>
											{" "}
											<span className="nav-badge">{attention}</span>
										</>
									) : null}
								</NavLink>
							</nav>
						) : null}
						<span className="spacer" />
						{signedIn ? (
							<Menu
								isModerator={isModerator}
								moderation={moderation}
								otherLocaleHref={
									bilingual ? `/locale/${locale === "he" ? "en" : "he"}` : null
								}
								otherLocaleLang={locale === "he" ? "en" : "he"}
								labels={{
									install: t.installApp,
									installIos: t.installIos,
									open: t.menu,
									close: t.menu,
									moderators: t.admin,
									profile: t.profile,
									about: t.about,
									terms: t.terms,
									privacy: t.privacy,
									contact: t.contactShort,
									connect: t.connect,
									invite: t.inviteTitle,
									signOut: t.signOut,
									otherLocale: locale === "he" ? "English" : "עברית",
								}}
							/>
						) : (
							<nav className="nav" aria-label={t.accountNav}>
								<a href="/login">{t.signIn}</a>
								{bilingual ? (
									<a
										href={`/locale/${locale === "he" ? "en" : "he"}`}
										lang={locale === "he" ? "en" : "he"}
									>
										{locale === "he" ? "English" : "עברית"}
									</a>
								) : null}
							</nav>
						)}
					</div>
				</header>
				{asMember ? (
					<p className="viewing-as">
						{t.viewingAsMember}{" "}
						<a href="/view-as?as=moderator">{t.viewAsModerator}</a>
					</p>
				) : null}
				{/* Focusable so the skip link lands here rather than scrolling only. */}
				<div className="page" id="main" tabIndex={-1}>
					{children}
				</div>
				{signedIn ? (
					<Tabs
						label={t.sections}
						tabs={[
							{ href: "/shelf", label: t.shelf, icon: "shelf" },
							{ href: "/shelf/add", label: t.tabAdd, icon: "add" },
							{ href: "/", label: t.browse, icon: "browse", main: true },
							{ href: "/wishlist", label: t.wishlistTab, icon: "wishlist" },
							{
								href: "/loans",
								label: t.loans,
								icon: "loans",
								...(attention ? { badge: attention } : {}),
							},
						]}
					/>
				) : null}
				{/* Signed in, these live in the menu; signed out there is no menu,
				    and the legal pages still have to be reachable. */}
				{signedIn ? null : (
					<footer className="footer">
						<span>{words.name || t.appShort}</span>
						<span className="footer-links">
							<a href="/about">{t.about}</a>
							<a href="/terms">{t.terms}</a>
							<a href="/privacy">{t.privacy}</a>
							<a href="/contact">{t.contactTitle}</a>
						</span>
					</footer>
				)}
			</body>
		</html>
	);
}
