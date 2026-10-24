/** A file Vite folds into the bundle as a data: URL (`?inline`). */
declare module "*?inline" {
	const url: string;
	export default url;
}
