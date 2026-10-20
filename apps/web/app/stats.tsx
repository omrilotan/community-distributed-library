/** A row of figures. Small, quiet, and never shown to anyone but their owner. */
export function Stats({ items }: { items: [string, string][] }) {
	return (
		<dl className="stats-list">
			{items.map(([label, value]) => (
				<div key={label}>
					<dt>{label}</dt>
					<dd>{value}</dd>
				</div>
			))}
		</dl>
	);
}
