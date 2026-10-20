/** Small server-rendered building blocks shared across pages. */

export function PageHead({
	title,
	aside,
}: {
	title: React.ReactNode;
	aside?: React.ReactNode;
}) {
	return (
		<div className="page-head">
			<h1>{title}</h1>
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
