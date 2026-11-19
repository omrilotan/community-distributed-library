import { cookies } from "next/headers";
import { clientIp, coreRaw } from "../../lib/core.ts";
import { InviteState } from "@cdl/contracts";
import { strings, type Locale } from "../../lib/i18n.ts";
import { whyNot } from "../../lib/invite-words.ts";
import { Callout } from "../ui.tsx";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.join);

/**
 * What became of the invite. A link that cannot let anyone in sends no
 * email, so the page says why rather than promise one. Anything else, a
 * hiccup included, leaves the form as it was.
 */
async function stateOf(invite: string | undefined): Promise<InviteState> {
	if (!invite) return { state: "usable" };
	const response = await coreRaw("/v1/invites/state", {
		method: "POST",
		headers: { "content-type": "application/json", ...(await clientIp()) },
		body: JSON.stringify({ token: invite }),
	}).catch(() => null);
	if (!response?.ok) return { state: "usable" };
	const parsed = InviteState.safeParse(await response.json().catch(() => null));
	return parsed.success ? parsed.data : { state: "usable" };
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
	const invited = await stateOf(invite);
	const why = whyNot(invited, t);

	if (why) {
		return (
			<main className="narrow">
				<h1>{t.join}</h1>
				<Callout tone={invited.state === "early" ? "info" : "warn"}>
					{why}
				</Callout>
				{/* A link that will open on its day needs no other invite. */}
				{invited.state === "early" ? null : (
					<p>
						{invited.membersInvite === false
							? t.inviteAskModerators
							: t.inviteAskMembers}
					</p>
				)}
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
					autoComplete="email"
					autoCapitalize="none"
					spellCheck={false}
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
