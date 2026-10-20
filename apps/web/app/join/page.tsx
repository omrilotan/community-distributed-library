import { cookies } from "next/headers";
import { coreRaw } from "../../lib/core.ts";
import { strings, type Locale } from "../../lib/i18n.ts";
import { Callout } from "../ui.tsx";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.join);

type InviteState = "usable" | "used" | "expired";

/**
 * What became of the invite. A link used up or past its date sends no
 * email, so the page says which it is rather than promise one. Anything
 * else, a hiccup included, leaves the form as it was.
 */
async function stateOf(invite: string | undefined): Promise<InviteState> {
	if (!invite) return "usable";
	const response = await coreRaw("/v1/invites/state", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token: invite }),
	}).catch(() => null);
	if (!response?.ok) return "usable";
	const body = (await response.json().catch(() => null)) as {
		state?: InviteState;
	} | null;
	return body?.state ?? "usable";
}

/** Landing for an invite link from the WhatsApp group: same form, invite attached. */
export default async function JoinPage({
	searchParams,
}: {
	searchParams: Promise<{ invite?: string }>;
}) {
	const { invite } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const state = await stateOf(invite);

	if (state !== "usable") {
		return (
			<main className="narrow">
				<h1>{t.join}</h1>
				<Callout tone="warn">
					{state === "used" ? t.inviteUsedUp : t.inviteExpired}
				</Callout>
				<p>
					{t.alreadyMember} <a href="/login">{t.signIn}</a>
				</p>
			</main>
		);
	}

	return (
		<main className="narrow">
			<h1>{t.join}</h1>
			<p className="muted">{t.joinHint}</p>
			<form action="/api/auth/magic-link" method="post">
				<input type="hidden" name="invite" value={invite ?? ""} />
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
			<p className="muted">
				{t.termsHint} <a href="/terms">{t.terms}</a>
			</p>
		</main>
	);
}
