import { cookies } from "next/headers";
import { getMe } from "../../lib/profile.ts";
import { env } from "cloudflare:workers";
import { strings, type Locale } from "../../lib/i18n.ts";
import { PageHead } from "../ui.tsx";
import { CopyButton } from "../copy-button.tsx";
import { core } from "../../lib/core.ts";
import { sessionToken } from "../../lib/session.ts";
import { TokenForm } from "./token-form.tsx";
import { WebhookForm } from "./webhook-form.tsx";
import {
	EVENT_KINDS,
	SCOPES,
	SCOPE_DESCRIPTIONS,
	type WebhookView,
} from "@cdl/contracts";
import { moderates } from "../../lib/view-as.ts";
import { titled } from "../../lib/page-title.ts";
import { shownOnce } from "../../lib/shown-once.ts";

export const generateMetadata = titled((t) => t.connectTitle);

/** How to plug an AI assistant into the library. Public: nothing here is secret. */
export default async function ConnectPage({
	searchParams,
}: {
	searchParams: Promise<{ webhook?: string; code?: string; token?: string }>;
}) {
	const { webhook: webhookFlash, code, token } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const base =
		process.env.NODE_ENV !== "production"
			? "http://localhost:8788"
			: ((env as unknown as { MCP_URL?: string }).MCP_URL ?? "");
	const mcpUrl = `${base}/mcp`;
	const he = locale === "he";
	const appBase =
		process.env.NODE_ENV !== "production"
			? "http://localhost:3000"
			: ((env as unknown as { APP_URL?: string }).APP_URL ?? "");
	const apiBase = `${appBase}/api/v1`;
	// Signed-in members may mint a personal token; everyone may read the docs.
	const me = (await sessionToken()) ? (await getMe()).body : null;
	const hooks = me
		? ((await core<{ webhooks: WebhookView[] }>("/v1/me/webhooks")).body
				?.webhooks ?? [])
		: [];

	const steps = he
		? [
				{
					name: "Claude (אתר ואפליקציה)",
					lines: [
						"הגדרות ← Connectors ← Add custom connector.",
						`הדביקו את הכתובת: ${mcpUrl}`,
						"Claude יפנה אתכם למסך אישור כאן באתר. בחרו הרשאות ואשרו.",
					],
				},
				{
					name: "Claude Code",
					code: `claude mcp add --transport http library ${mcpUrl}`,
					lines: [
						"בפעם הראשונה: /mcp ← library ← Authenticate. נפתח דפדפן למסך האישור.",
					],
				},
				{
					name: "ChatGPT",
					lines: [
						"Settings ← Connectors ← Create (דורש מצב מפתח/Developer mode).",
						`כתובת השרת: ${mcpUrl}, אימות: OAuth.`,
					],
				},
				{
					name: "Cursor / עורכים אחרים",
					code: JSON.stringify(
						{ mcpServers: { library: { url: mcpUrl } } },
						null,
						2,
					),
					lines: [
						"הוסיפו ל־mcp.json. עורך שתומך ב־OAuth יפתח את מסך האישור לבד.",
					],
				},
			]
		: [
				{
					name: "Claude (web and desktop)",
					lines: [
						"Settings → Connectors → Add custom connector.",
						`Paste the URL: ${mcpUrl}`,
						"Claude sends you to a consent screen here on the site. Pick the permissions and allow.",
					],
				},
				{
					name: "Claude Code",
					code: `claude mcp add --transport http library ${mcpUrl}`,
					lines: [
						"First use: /mcp → library → Authenticate. A browser opens the consent screen.",
					],
				},
				{
					name: "ChatGPT",
					lines: [
						"Settings → Connectors → Create (needs Developer mode).",
						`Server URL: ${mcpUrl}, authentication: OAuth.`,
					],
				},
				{
					name: "Cursor and other editors",
					code: JSON.stringify(
						{ mcpServers: { library: { url: mcpUrl } } },
						null,
						2,
					),
					lines: [
						"Add to mcp.json. Editors that support OAuth open the consent screen on their own.",
					],
				},
			];

	const can = t.assistantCan;
	const cannot = t.assistantCannot;

	return (
		<main className="narrow" style={{ maxInlineSize: "40rem" }}>
			<PageHead title={t.connectTitle} />
			<p>{t.connectIntro}</p>
			{/* The one thing anybody comes here to fetch. */}
			<CopyButton value={mcpUrl} labels={{ copy: t.copy, copied: t.copied }} />

			{steps.map((step) => (
				<section key={step.name}>
					<h2>{step.name}</h2>
					{step.code ? (
						<CopyButton
							value={step.code}
							block
							labels={{ copy: t.copy, copied: t.copied }}
						/>
					) : null}
					<ol>
						{step.lines.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ol>
				</section>
			))}

			<h2>{t.connectCan}</h2>
			<ul>
				{can.map((line) => (
					<li key={line}>{line}</li>
				))}
			</ul>
			<h2>{t.connectCannot}</h2>
			<ul>
				{cannot.map((line) => (
					<li key={line}>{line}</li>
				))}
			</ul>
			<p className="muted">{t.connectManage}</p>

			<h2 id="api">{t.apiTitle}</h2>
			<p>{t.apiIntro}</p>
			<p>
				<code dir="ltr">{apiBase}</code> ·{" "}
				<a href="/api/v1/openapi.json">{t.apiSpec}</a>
			</p>
			<pre dir="ltr" tabIndex={0}>
				<code>{`curl -H "Authorization: Bearer $TOKEN" "${apiBase}/search?q=oz"`}</code>
			</pre>
			<h3 id="tokens">{t.tokenTitle}</h3>
			<p className="muted">{t.tokenIntro}</p>
			{me ? (
				<TokenForm
					scopes={SCOPES.map((scope) => ({
						name: scope,
						description: SCOPE_DESCRIPTIONS[scope][locale],
					}))}
					moderator={moderates(me.role)}
					made={await shownOnce("token")}
					failure={token === "failed"}
					labels={{
						name: t.tokenName,
						create: t.tokenCreate,
						shownOnce: t.tokenShownOnce,
						copy: t.tokenCopy,
						copied: t.tokenCopied,
						failed: t.tokenFailed,
						moderatorOnly: t.moderatorsOnly,
					}}
				/>
			) : (
				<p>
					<a href="/login">{t.tokenSignIn}</a>
				</p>
			)}

			<h2 id="webhooks">{t.webhooksTitle}</h2>
			<p>{t.webhooksIntro}</p>
			<pre dir="ltr" tabIndex={0}>
				<code>{`POST <your url>
x-cdl-event: loan.accepted
x-cdl-delivery: <event id>
x-cdl-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + body)>

{"id":"…","kind":"loan.accepted","data":{"loanId":"…","copyId":"…"},"createdAt":…}`}</code>
			</pre>
			<p className="muted">
				{t.webhooksReplay(`${apiBase}/events?since=<event id>`)}
			</p>
			{webhookFlash === "ok" ? (
				<p className="callout">{t.webhookPingOk}</p>
			) : null}
			{webhookFlash === "failed" ? (
				<p className="callout callout-warn">
					{t.webhookPingFailed(code ?? "")}
				</p>
			) : null}
			{webhookFlash === "removed" ? (
				<p className="callout">{t.webhookRemoved}</p>
			) : null}
			{hooks.length ? (
				<ul className="hooks">
					{hooks.map((hook) => (
						<li key={hook.id}>
							<div>
								<code dir="ltr">{hook.url}</code>
								<div className="muted">
									{hook.kinds.length === EVENT_KINDS.length
										? t.webhookAll
										: hook.kinds.join(", ")}
									{hook.lastAt
										? ` · ${t.webhookLast(hook.lastStatus, hook.lastAt, locale)}`
										: ""}
									{hook.disabledAt ? ` · ${t.webhookDisabled}` : ""}
								</div>
							</div>
							<div className="actions">
								<form
									action={`/api/me/webhooks/${hook.id}`}
									method="post"
									className="inline"
								>
									<input type="hidden" name="action" value="test" />
									<button type="submit" className="quiet">
										{t.webhookTest}
									</button>
								</form>
								<form
									action={`/api/me/webhooks/${hook.id}`}
									method="post"
									className="inline"
								>
									<input type="hidden" name="action" value="delete" />
									<button type="submit" className="link">
										{t.webhookRemove}
									</button>
								</form>
							</div>
						</li>
					))}
				</ul>
			) : null}
			{me ? (
				<WebhookForm
					kinds={EVENT_KINDS}
					made={await shownOnce("webhook-secret")}
					failure={webhookFlash === "refused"}
					labels={{
						url: t.webhookUrl,
						kinds: t.webhookKinds,
						allKinds: t.webhookAllHint,
						create: t.webhookCreate,
						secretOnce: t.webhookSecretOnce,
						copy: t.tokenCopy,
						copied: t.tokenCopied,
						failed: t.webhookFailed,
						done: t.webhookDone,
					}}
				/>
			) : null}
		</main>
	);
}
