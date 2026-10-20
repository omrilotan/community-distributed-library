export type Sort = "new" | "title" | "distance";

/** The radii offered, in kilometres. None chosen means the whole library. */
export const DISTANCES = [1, 3, 5, 10] as const;

/** A radius from the address, if it is one of those offered. */
export function parseWithin(value: string | undefined): number | null {
	const km = Number(value) / 1000;
	return (DISTANCES as readonly number[]).includes(km) ? km * 1000 : null;
}

/**
 * How the shelves are shown. Plain links like the tag chips — no JavaScript,
 * and the address bar carries the choice into paging, sharing and the Back
 * button.
 *
 * Split in two on purpose. "Available now" is the filter people reach for, so
 * it sits in the quick row; ownership and order are set once and forgotten,
 * so they live behind the Filters disclosure and leave the first screen of a
 * phone for the books.
 */
interface State {
	/** The current query, without these controls, `offset` or `shown`. */
	params: Record<string, string | undefined>;
	sort: Sort;
	availableOnly: boolean;
	showMine: boolean;
	showRead: boolean;
	wished: boolean;
	/** Metres, or null for no limit. */
	within: number | null;
}

function hrefFor(
	state: State,
	next: {
		sort?: Sort;
		availableOnly?: boolean;
		showMine?: boolean;
		showRead?: boolean;
		wished?: boolean;
		within?: number | null;
	},
): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(state.params)) {
		if (value) query.set(key, value);
	}
	const sort = next.sort ?? state.sort;
	if (sort !== "new") query.set("sort", sort);
	if (next.availableOnly ?? state.availableOnly)
		query.set("availableOnly", "1");
	if (next.showMine ?? state.showMine) query.set("showMine", "1");
	if (next.showRead ?? state.showRead) query.set("showRead", "1");
	if (next.wished ?? state.wished) query.set("wished", "1");
	const within = next.within === undefined ? state.within : next.within;
	if (within) query.set("within", String(within));
	const search = query.toString();
	return search ? `/?${search}` : "/";
}

/** One chip that toggles itself: only what can be borrowed today. */
export function AvailableChip({ label, ...state }: State & { label: string }) {
	return (
		<a
			className="chip"
			href={hrefFor(state, { availableOnly: !state.availableOnly })}
			aria-current={state.availableOnly ? "true" : undefined}
			data-toggle="availableOnly"
			rel="nofollow"
		>
			{label}
		</a>
	);
}

/** One chip that toggles itself: only the books the member wants to read. */
export function WishedChip({ label, ...state }: State & { label: string }) {
	return (
		<a
			className="chip"
			href={hrefFor(state, { wished: !state.wished })}
			aria-current={state.wished ? "true" : undefined}
			data-toggle="wished"
			rel="nofollow"
		>
			{label}
		</a>
	);
}

/** Whose books, and in what order: inside the Filters disclosure. */
export function OrderControls({
	labels,
	compact = false,
	...state
}: State & {
	/** Everyone close by: no nearest-first, no distance to filter by. */
	compact?: boolean;
	labels: {
		sortBy: string;
		sortNew: string;
		sortTitle: string;
		sortDistance: string;
		show: string;
		available: string;
		showMine: string;
		showRead: string;
		distance: string;
		anyDistance: string;
		withinKm: (km: number) => string;
	};
}) {
	const sorts: [Sort, string][] = [
		["new", labels.sortNew],
		["title", labels.sortTitle],
		...(compact ? [] : [["distance", labels.sortDistance] as [Sort, string]]),
	];
	return (
		<div className="listing-controls">
			<div className="filter-row" role="group" aria-label={labels.sortBy}>
				<span className="muted">{labels.sortBy}</span>
				<div className="filter-chips">
					{sorts.map(([option, label]) => (
						<a
							className="chip"
							key={option}
							href={hrefFor(state, { sort: option })}
							aria-current={state.sort === option ? "true" : undefined}
							data-param="sort"
							data-value={option === "new" ? "" : option}
							rel="nofollow"
						>
							{label}
						</a>
					))}
				</div>
			</div>
			{/* How far: nothing is hidden for distance unless asked. */}
			{compact ? null : (
				<div className="filter-row" role="group" aria-label={labels.distance}>
					<span className="muted">{labels.distance}</span>
					<div className="filter-chips">
						<a
							className="chip"
							href={hrefFor(state, { within: null })}
							aria-current={state.within === null ? "true" : undefined}
							data-param="within"
							data-value=""
							rel="nofollow"
						>
							{labels.anyDistance}
						</a>
						{DISTANCES.map((km) => (
							<a
								className="chip"
								key={km}
								href={hrefFor(state, { within: km * 1000 })}
								aria-current={state.within === km * 1000 ? "true" : undefined}
								data-param="within"
								data-value={String(km * 1000)}
								rel="nofollow"
							>
								{labels.withinKm(km)}
							</a>
						))}
					</div>
				</div>
			)}
			{/* What to leave in. Browsing is for finding something to borrow,
			    so your own books, and the ones you have read, stay out of it
			    until you ask. */}
			<div className="filter-row" role="group" aria-label={labels.show}>
				<span className="muted">{labels.show}</span>
				<div className="filter-chips">
					<AvailableChip {...state} label={labels.available} />
					<a
						className="chip"
						href={hrefFor(state, { showMine: !state.showMine })}
						aria-current={state.showMine ? "true" : undefined}
						data-toggle="showMine"
						rel="nofollow"
					>
						{labels.showMine}
					</a>
					{/* Only where members mark what they have read: a books library. */}
					{labels.showRead ? (
						<a
							className="chip"
							href={hrefFor(state, { showRead: !state.showRead })}
							aria-current={state.showRead ? "true" : undefined}
							data-toggle="showRead"
							rel="nofollow"
						>
							{labels.showRead}
						</a>
					) : null}
				</div>
			</div>
		</div>
	);
}
