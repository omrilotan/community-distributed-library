import { cookies } from "next/headers";
import { taggingOnly, type TaggingStep } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { vocabulary } from "../../../lib/vocabulary.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { moderatorOrNull } from "../guard.ts";
import { TaggingView } from "../../tagging-view.tsx";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.tagging} · ${t.admin}`);

/**
 * Flip through the books and tag them, one at a time: tick what fits, type a
 * new value where the vocabulary lacks one, save and go on. Built for many
 * books in a sitting, so everything is on one screen and Enter saves.
 */
export default async function TaggingPage({
	searchParams,
}: {
	searchParams: Promise<{ at?: string; only?: string; error?: string }>;
}) {
	const me = await moderatorOrNull();
	const params = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const only = taggingOnly(params.only);
	const at = Math.max(0, Number(params.at ?? 0) || 0);
	const [step, vocab] = await Promise.all([
		core<TaggingStep>(
			`/v1/admin/tagging?only=${encodeURIComponent(only)}&at=${at}`,
		),
		vocabulary(),
	]);
	const body = step.status === 200 ? step.body : null;

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="tagging" admin={me.role === "admin"} />
			{params.error ? (
				<Callout tone="warn">{t.adminActionFailed}</Callout>
			) : null}

			<TaggingView
				step={body}
				vocab={vocab}
				locale={locale}
				t={t}
				base="/admin/tagging"
				action="/api/admin/tagging"
				only={only}
				at={at}
				hint={t.taggingHint}
			/>
		</main>
	);
}
