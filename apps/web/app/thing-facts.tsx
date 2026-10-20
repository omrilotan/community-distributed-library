import type { ThingDetails } from "@cdl/contracts";
import type { Strings } from "../lib/i18n.ts";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";

/**
 * What an owner says about their thing: how many, brand and model, what comes
 * with it, what the borrower brings, how to look after it. Nothing for a book.
 */
export function ThingFacts({
	quantity,
	details,
	t,
}: {
	quantity: number;
	details: ThingDetails | null;
	t: Strings;
}) {
	const rows: [string, string][] = [];
	const make = [details?.brand, details?.model].filter(Boolean).join(" ");
	if (make) rows.push([t.brand, make]);
	if (details?.included) rows.push([t.included, details.included]);
	if (details?.needs) rows.push([t.needs, details.needs]);
	if (details?.care) rows.push([t.care, details.care]);
	const link = outside(details?.link);
	if (quantity <= 1 && rows.length === 0 && !link) return null;
	return (
		<div className="thing-facts">
			{quantity > 1 ? <p className="badge">{t.setOf(quantity)}</p> : null}
			{rows.length ? (
				<dl>
					{rows.map(([label, value]) => (
						<div key={label}>
							<dt className="muted">{label}</dt>
							<dd>
								<bdi>{value}</bdi>
							</dd>
						</div>
					))}
				</dl>
			) : null}
			{/* Somebody else's website: said so, opened apart, not followed. */}
			{link ? (
				<p className="thing-link">
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer nofollow ugc external"
					>
						{t.productPage}
						<ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
					</a>{" "}
					<span className="muted">{t.externalSite(link.host)}</span>
				</p>
			) : null}
		</div>
	);
}

/** Only a web address is ever made a link; anything else shows nothing. */
function outside(value: string | undefined): URL | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? url : null;
	} catch {
		return null;
	}
}
