import { cookies } from "next/headers";
import { SCOPE_DESCRIPTIONS } from "@cdl/contracts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { requireProfile } from "../../../lib/profile.ts";
import { Callout, PageHead } from "../../ui.tsx";
import { env } from "cloudflare:workers";
import { pendingConsent } from "../../../lib/consent.ts";
import { moderates } from "../../../lib/view-as.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.consentTitle);

/**
 * The OAuth consent screen. The MCP server sends the client here; the member
 * (already signed in) sees who is asking and for what, and says yes or no.
 */
export default async function ConsentPage({
	searchParams,
}: {
	searchParams: Promise<{ req?: string; error?: string }>;
}) {
	const me = await requireProfile();
	const { req, error } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const mcpUrl =
		process.env.NODE_ENV !== "production"
			? "http://localhost:8788"
			: ((env as unknown as { MCP_URL?: string }).MCP_URL ?? "");
	const pending = await pendingConsent(req);
	const grantable = (pending?.scopes ?? []).filter(
		(value) => value !== "admin" || moderates(me.role),
	);

	if (!req || !pending || grantable.length === 0) {
		return (
			<main className="narrow">
				<PageHead title={t.consentTitle} />
				<Callout tone="warn">{t.consentBad}</Callout>
			</main>
		);
	}

	return (
		<main className="narrow">
			<PageHead title={t.consentTitle} />
			{error ? <Callout tone="warn">{t.adminActionFailed}</Callout> : null}
			<p>
				<strong>
					<bdi>{pending.clientName}</bdi>
				</strong>{" "}
				{t.consentAsks} <bdi>{me.displayName}</bdi>:
			</p>
			<p className="muted">
				{t.consentReturnsTo} <bdi dir="ltr">{pending.redirectHost}</bdi>
			</p>
			<form action="/api/oauth/approve" method="post">
				<input type="hidden" name="req" value={req} />
				<ul className="scopes">
					{grantable.map((value) => (
						<li key={value}>
							<label className="check">
								<input
									type="checkbox"
									name="scope"
									value={value}
									// Looking is ticked; acting for the member is theirs
									// to tick. Text an assistant reads can try to steer it.
									defaultChecked={value.endsWith(":read")}
								/>
								{SCOPE_DESCRIPTIONS[value][locale]}
							</label>
						</li>
					))}
				</ul>
				<div className="actions">
					<button type="submit">{t.consentApprove}</button>
					<a href={`${mcpUrl}/oauth/denied?req=${encodeURIComponent(req)}`}>
						{t.consentDeny}
					</a>
				</div>
				<p className="muted">{t.consentHint}</p>
			</form>
		</main>
	);
}
