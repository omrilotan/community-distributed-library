"use client";

import { useEffect, useRef, useState } from "react";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { usePathname } from "next/navigation";

interface Labels {
	install: string;
	installIos: string;
	open: string;
	close: string;
	moderators: string;
	profile: string;
	about: string;
	terms: string;
	privacy: string;
	contact: string;
	connect: string;
	invite: string;
	signOut: string;
	otherLocale: string;
}

/**
 * Everything that is not a daily destination: the profile, the moderator area,
 * and the pages people read once. A `details` element, so it opens without
 * JavaScript; the script only closes it again.
 */
export function Menu({
	labels,
	isModerator,
	moderation = 0,
	otherLocaleHref,
	otherLocaleLang,
}: {
	labels: Labels;
	isModerator: boolean;
	/** Suggestions and reports waiting for a moderator: its own count, not Loans'. */
	moderation?: number;
	/** The other language's switch; none when the library offers one language. */
	otherLocaleHref: string | null;
	otherLocaleLang: string;
}) {
	const menu = useRef<HTMLDetailsElement>(null);
	const pathname = usePathname();
	// Where to come back to after switching language. Rendered on the server
	// without it, so the link works before hydration; the referrer covers that.
	const [back, setBack] = useState("");
	useEffect(() => {
		setBack(`${window.location.pathname}${window.location.search}`);
	}, [pathname]);

	// "Add to home screen", but only where it means something: the browser
	// offers the prompt, or it is an iPhone, where the only way is by hand.
	const [installer, setInstaller] = useState<InstallPrompt | null>(null);
	const [installed, setInstalled] = useState(true);
	const [showIosSteps, setShowIosSteps] = useState(false);

	useEffect(() => {
		const standalone =
			window.matchMedia("(display-mode: standalone)").matches ||
			(navigator as { standalone?: boolean }).standalone === true;
		setInstalled(standalone);

		// The inline script in the layout may already have caught it.
		const caught = (window as { __installPrompt?: InstallPrompt })
			.__installPrompt;
		if (caught) setInstaller(caught);

		const offered = (event: Event) => {
			event.preventDefault();
			setInstaller(event as InstallPrompt);
		};
		const done = () => {
			setInstalled(true);
			setInstaller(null);
			delete (window as { __installPrompt?: InstallPrompt }).__installPrompt;
		};
		window.addEventListener("beforeinstallprompt", offered);
		window.addEventListener("appinstalled", done);
		return () => {
			window.removeEventListener("beforeinstallprompt", offered);
			window.removeEventListener("appinstalled", done);
		};
	}, []);

	const isIphone =
		typeof navigator !== "undefined" &&
		/iphone|ipad|ipod/i.test(navigator.userAgent);
	const canInstall = !installed && (installer !== null || isIphone);

	// Close when the page changes, when Escape is pressed, or on a click outside.
	// Not on the first run: that fires when hydration finishes, which can be
	// after somebody has already opened the menu, and would shut it on them.
	const firstRender = useRef(true);
	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}
		if (menu.current) menu.current.open = false;
	}, [pathname]);

	useEffect(() => {
		const close = (event: Event) => {
			const element = menu.current;
			if (!element?.open) return;
			if (event instanceof KeyboardEvent && event.key !== "Escape") return;
			if (
				event.type === "pointerdown" &&
				event.target instanceof Node &&
				element.contains(event.target)
			) {
				return;
			}
			element.open = false;
		};
		document.addEventListener("pointerdown", close);
		document.addEventListener("keydown", close);
		return () => {
			document.removeEventListener("pointerdown", close);
			document.removeEventListener("keydown", close);
		};
	}, []);

	return (
		<details className="menu" ref={menu}>
			<summary
				aria-label={
					isModerator && moderation
						? `${labels.open} (${moderation})`
						: labels.open
				}
			>
				<List size={22} aria-hidden="true" />
				{isModerator && moderation ? (
					<span className="menu-badge" aria-hidden="true">
						{moderation}
					</span>
				) : null}
			</summary>
			<nav
				className="menu-panel"
				aria-label={labels.open}
				// A link to the page already open (the invite, from the profile)
				// changes no pathname; close on the click instead.
				onClick={(event) => {
					if (
						event.target instanceof Element &&
						event.target.closest("a") &&
						menu.current
					) {
						menu.current.open = false;
					}
				}}
			>
				{/* The one thing the menu asks of everyone: grow the library. */}
				<a href="/settings#invite" className="menu-invite">
					{labels.invite}
				</a>
				{isModerator ? (
					<a href="/admin">
						{labels.moderators}
						{moderation ? (
							<>
								{" "}
								<span className="nav-badge badge-moderation">{moderation}</span>
							</>
						) : null}
					</a>
				) : null}
				{/* Another device and assistants are in settings, at the top. */}
				<a href="/settings">{labels.profile}</a>
				{otherLocaleHref ? (
					<a
						href={
							back
								? `${otherLocaleHref}?back=${encodeURIComponent(back)}`
								: otherLocaleHref
						}
						lang={otherLocaleLang}
					>
						{labels.otherLocale}
					</a>
				) : null}
				{canInstall ? (
					<button
						type="button"
						onClick={() => {
							if (installer) {
								void installer.prompt();
								setInstaller(null);
								delete (window as { __installPrompt?: InstallPrompt })
									.__installPrompt;
							} else {
								setShowIosSteps((shown) => !shown);
							}
						}}
					>
						{labels.install}
					</button>
				) : null}
				{showIosSteps ? (
					<span className="menu-note">{labels.installIos}</span>
				) : null}

				{/* Read once, needed rarely: there, but quiet. */}
				<div className="menu-minor">
					<a href="/about">{labels.about}</a>
					<a href="/terms">{labels.terms}</a>
					<a href="/privacy">{labels.privacy}</a>
					<a href="/contact">{labels.contact}</a>
				</div>
				<form action="/logout" method="post">
					<button type="submit">{labels.signOut}</button>
				</form>
			</nav>
		</details>
	);
}

/** The event Chrome fires when it would offer to install the app. */
interface InstallPrompt extends Event {
	prompt(): Promise<void>;
}
