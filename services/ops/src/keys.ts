/** Equal without saying where they differ. */
export async function same(given: string, wanted: string): Promise<boolean> {
	const digest = async (value: string) =>
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
		);
	const [a, b] = await Promise.all([digest(given), digest(wanted)]);
	let differ = 0;
	for (let at = 0; at < a.length; at += 1) differ |= a[at]! ^ b[at]!;
	return differ === 0 && wanted.length > 0;
}
