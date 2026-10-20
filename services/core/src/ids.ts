const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, no I L O U

/** ULID: 48-bit timestamp then 80 bits of randomness, sortable by creation time. */
/** The moment, in the seconds every table keeps. */
export const now = () => Math.floor(Date.now() / 1000);

export function ulid(at = Date.now()): string {
	let time = "";
	let remaining = at;
	for (let index = 0; index < 10; index += 1) {
		time = ALPHABET[remaining % 32]! + time;
		remaining = Math.floor(remaining / 32);
	}

	const bytes = crypto.getRandomValues(new Uint8Array(16));
	let random = "";
	for (let index = 0; index < 16; index += 1)
		random += ALPHABET[bytes[index]! % 32];

	return time + random;
}
