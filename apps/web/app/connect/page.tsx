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

/** One step of setting up an assistant: what to do, and what to copy if anything. */
interface Step {
	text: string;
	/** A command or a file to copy, shown as a block. */
	code?: string;
	/** The server address, offered again where it is pasted. */
	address?: boolean;
}

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

	const command = `claude mcp add --transport http library ${mcpUrl}`;
	const editorConfig = JSON.stringify(
		{ mcpServers: { library: { url: mcpUrl } } },
		null,
		2,
	);
	const apps: { name: string; steps: Step[] }[] = he
		? [
				{
					name: "Claude (אתר ואפליקציה)",
					steps: [
						{ text: "פתחו הגדרות ← Connectors ← Add custom connector." },
						{ text: "הדביקו את כתובת השרת:", address: true },
						{ text: "במסך האישור שנפתח כאן באתר, בחרו מה מותר לו ואשרו." },
					],
				},
				{
					name: "Claude Code",
					steps: [
						{ text: "הריצו:", code: command },
						{
							text: "בפעם הראשונה: ‎/mcp‏ ← library ← Authenticate. נפתח דפדפן עם מסך האישור.",
						},
					],
				},
				{
					name: "ChatGPT",
					steps: [
						{
							text: "הפעילו Developer mode, ואז Settings ← Connectors ← Create.",
						},
						{ text: "הדביקו את כתובת השרת ובחרו אימות OAuth:", address: true },
					],
				},
				{
					name: "Cursor ועורכים אחרים",
					steps: [
						{ text: "הוסיפו ל־mcp.json:", code: editorConfig },
						{ text: "עורך שתומך ב־OAuth יפתח את מסך האישור בעצמו." },
					],
				},
			]
		: [
				{
					name: "Claude (web and desktop)",
					steps: [
						{ text: "Open Settings → Connectors → Add custom connector." },
						{ text: "Paste the server address:", address: true },
						{
							text: "A consent screen opens here on the site. Choose what it may do, and allow.",
						},
					],
				},
				{
					name: "Claude Code",
					steps: [
						{ text: "Run:", code: command },
						{
							text: "The first time, type /mcp, pick library and choose Authenticate. A browser opens the consent screen.",
						},
					],
				},
				{
					name: "ChatGPT",
					steps: [
						{
							text: "Turn on Developer mode, then open Settings → Connectors → Create.",
						},
						{
							text: "Paste the server address and choose OAuth:",
							address: true,
						},
					],
				},
				{
					name: "Cursor and other editors",
					steps: [
						{ text: "Add this to mcp.json:", code: editorConfig },
						{
							text: "Editors that support OAuth open the consent screen on their own.",
						},
					],
				},
			];

	const copyLabels = { copy: t.copy, copied: t.copied };

	return (
		<main className="narrow connect">
			<PageHead title={t.connectTitle} />
			<p className="connect-lead">{t.connectIntro}</p>

			{/* The one thing anybody comes here to fetch. */}
			<div className="connect-address">
				<span className="connect-label">{t.connectAddress}</span>
				<CopyButton value={mcpUrl} labels={copyLabels} />
			</div>

			<h2>{t.connectSetUp}</h2>
			<div className="connect-apps">
				{apps.map((app) => (
					<section key={app.name} className="connect-app">
						<h3>{app.name}</h3>
						<ol className="connect-steps">
							{app.steps.map((step) => (
								<li key={step.text}>
									<p>{step.text}</p>
									{step.address ? (
										<CopyButton value={mcpUrl} labels={copyLabels} />
									) : null}
									{step.code ? (
										<CopyButton value={step.code} block labels={copyLabels} />
									) : null}
								</li>
							))}
						</ol>
					</section>
				))}
			</div>

			<div className="connect-limits">
				<section>
					<h2>{t.connectCan}</h2>
					<ul className="connect-can">
						{t.assistantCan.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</section>
				<section>
					<h2>{t.connectCannot}</h2>
					<ul className="connect-cannot">
						{t.assistantCannot.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</section>
			</div>
			<p className="callout">{t.connectManage}</p>

			<div className="connect-developers">
				<h2>{t.connectDevelopers}</h2>
				<p className="muted">{t.connectDevelopersIntro}</p>

				<section className="connect-dev">
					<h3 id="api">{t.apiTitle}</h3>
					<p>{t.apiIntro}</p>
					<p>
						<code dir="ltr">{apiBase}</code> ·{" "}
						<a href="/api/v1/openapi.json">{t.apiSpec}</a>
					</p>
					<pre dir="ltr" tabIndex={0}>
						<code>{`curl -H "Authorization: Bearer $TOKEN" "${apiBase}/search?q=oz"`}</code>
					</pre>
				</section>

				<section className="connect-dev">
					<h3 id="tokens">{t.tokenTitle}</h3>
					<p>{t.tokenIntro}</p>
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
				</section>

				<section className="connect-dev">
					<h3 id="webhooks">{t.webhooksTitle}</h3>
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
				</section>
			</div>
		</main>
	);
}
