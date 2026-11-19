/** Small server-rendered building blocks shared across pages. */

export function PageHead({
	title,
	aside,
	as: Heading = "h1",
}: {
	title: React.ReactNode;
	aside?: React.ReactNode;
	/** A page has one h1; a second head on it is an h2 that looks the same. */
	as?: "h1" | "h2";
}) {
	return (
		<div className="page-head">
			<Heading>{title}</Heading>
			{aside ? <span className="muted">{aside}</span> : null}
		</div>
	);
}

export function Empty({
	title,
	hint,
	action,
}: {
	title: string;
	hint?: string | undefined;
	/** Somewhere to go from nothing: a link, shown as a button. */
	action?: { href: string; label: string } | undefined;
}) {
	return (
		<div className="empty">
			<strong>{title}</strong>
			{hint ? <span>{hint}</span> : null}
			{action ? (
				<a className="btn" href={action.href}>
					{action.label}
				</a>
			) : null}
		</div>
	);
}

export function Callout({
	children,
	tone = "info",
}: {
	children: React.ReactNode;
	tone?: "info" | "warn";
}) {
	return (
		<p className={`callout${tone === "warn" ? " callout-warn" : ""}`}>
			{children}
		</p>
	);
}
