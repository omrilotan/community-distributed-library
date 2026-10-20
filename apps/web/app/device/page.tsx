import { cookies } from "next/headers";
import { strings, type Locale } from "../../lib/i18n.ts";
import { requireProfile } from "../../lib/profile.ts";
import { PageHead } from "../ui.tsx";
import { DeviceLink } from "./device-link.tsx";
import { titled } from "../../lib/page-title.ts";
import { shownOnce } from "../../lib/shown-once.ts";
import { qrFor } from "../../lib/qr.ts";

export const generateMetadata = titled((t) => t.deviceTitle);

/** Sign in on a phone or another computer without waiting for an email. */
export default async function DevicePage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	await requireProfile();
	const { error } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const made = await shownOnce("device-link");
	return (
		<main className="narrow">
			<PageHead title={t.deviceTitle} />
			<p className="muted">{t.deviceHint}</p>
			<DeviceLink
				locale={locale}
				made={made ? { ...made, qr: qrFor(made.url) } : null}
				failure={error === "many" || error === "failed" ? error : null}
				labels={{
					create: t.deviceCreate,
					again: t.deviceAgain,
					creating: t.deviceCreating,
					failed: t.deviceFailed,
					tooMany: t.deviceTooMany,
					scan: t.deviceScan,
					orCopy: t.deviceOrCopy,
					until: t.deviceUntil,
					copy: t.copyLink,
					copied: t.linkCopied,
					qrAlt: t.deviceQrAlt,
				}}
			/>
		</main>
	);
}
