import { cookies } from "next/headers";
import { getMe } from "../../lib/profile.ts";
import { strings, type Locale } from "../../lib/i18n.ts";
import { sessionToken } from "../../lib/session.ts";
import { Callout, PageHead } from "../ui.tsx";
import { contactAddress } from "../../lib/operator.ts";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.contactTitle);

/**
 * One form for the three things somebody might need to say to whoever runs
 * the library. Open without signing in: a person asking for their data to be
 * deleted may no longer have a way in, and a complaint must never depend on
 * one. Moderators do not see these; a complaint may be about a moderator.
 */
export default async function ContactPage({
	searchParams,
}: {
	searchParams: Promise<{ topic?: string; sent?: string; error?: string }>;
}) {
	const { topic, sent, error } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const contact = contactAddress();

	// Signed in for real: a session that was ended answers 401, and its
	// holder writes in with an address like anybody else.
	const answer = (await sessionToken())
		? await getMe().catch(() => null)
		: null;
	const me = answer?.status === 200 ? answer.body : null;
	const chosen = topic === "data" || topic === "complaint" ? topic : "feedback";

	return (
		<main className="narrow" style={{ maxInlineSize: "34rem" }}>
			<PageHead title={t.contactTitle} />

			{sent ? <Callout>{t.contactSent}</Callout> : null}
			{error === "rate" ? (
				<Callout tone="warn">{t.contactTooMany}</Callout>
			) : null}
			{error && error !== "rate" ? (
				<Callout tone="warn">{t.contactFailed}</Callout>
			) : null}

			<p className="muted">{t.contactLede}</p>

			<form action="/api/contact" method="post">
				<p className="form-key">{t.requiredKey}</p>
				<label htmlFor="topic">{t.contactTopic}</label>
				<select id="topic" name="topic" defaultValue={chosen}>
					<option value="feedback">{t.contactFeedback}</option>
					<option value="data">{t.contactData}</option>
					<option value="complaint">{t.contactComplaint}</option>
				</select>

				{me ? (
					<p className="muted">{t.contactAsYou(me.email)}</p>
				) : (
					<>
						<label htmlFor="email">{t.email}</label>
						<input
							id="email"
							name="email"
							type="email"
							inputMode="email"
							dir="ltr"
							required
						/>
					</>
				)}

				<label htmlFor="body">{t.contactBody}</label>
				<textarea
					id="body"
					name="body"
					rows={8}
					dir="auto"
					maxLength={4000}
					required
					defaultValue=""
				/>

				<button type="submit">{t.contactSend}</button>
			</form>

			<p className="muted">
				{t.contactRights}{" "}
				<a href={`mailto:${contact}`} dir="ltr">
					{contact}
				</a>{" "}
				· <a href="/privacy">{t.privacy}</a>
			</p>
		</main>
	);
}
