/** A file Vite folds into the bundle as a data: URL (`?inline`). */
declare module "*?inline" {
	const url: string;
	export default url;
}

/** A file Vite emits beside the bundle, imported as its address (`?url`). */
declare module "*?url" {
	const url: string;
	export default url;
}
