/**
 * Where a webhook may be sent: a public https address. Not this machine, not
 * a private or link-local network, not a range kept for documentation or
 * testing: a library's Worker must not be made to call into someone's own
 * network on a member's say-so. Names are judged as written, the way the
 * URL parser normalises them (so "https://2130706433/" is 127.0.0.1).
 * Development (`allowLocal`) may also use localhost, over http too.
 */
export function publicTarget(input: string, allowLocal = false): boolean {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}
	const host = url.hostname;
	if (allowLocal && (host === "localhost" || host === "127.0.0.1"))
		return url.protocol === "https:" || url.protocol === "http:";
	if (url.protocol !== "https:") return false;
	if (host.startsWith("[")) return publicIpv6(host.slice(1, -1));
	const v4 = ipv4(host);
	if (v4) return publicIpv4(v4);
	// A name nobody outside a home or an office can look up.
	return (
		host.includes(".") &&
		!/(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|arpa)$/.test(host)
	);
}

function ipv4(host: string): number[] | null {
	const parts = host.split(".");
	if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part)))
		return null;
	const octets = parts.map(Number);
	return octets.every((octet) => octet <= 255) ? octets : null;
}

/** [first address as four octets, prefix length] for every range refused. */
const PRIVATE_V4: [number[], number][] = [
	[[0, 0, 0, 0], 8], // "this network"
	[[10, 0, 0, 0], 8], // private
	[[100, 64, 0, 0], 10], // carrier-grade NAT
	[[127, 0, 0, 0], 8], // loopback
	[[169, 254, 0, 0], 16], // link-local, cloud metadata
	[[172, 16, 0, 0], 12], // private
	[[192, 0, 0, 0], 24], // protocol assignments
	[[192, 0, 2, 0], 24], // documentation
	[[192, 88, 99, 0], 24], // 6to4 relays
	[[192, 168, 0, 0], 16], // private
	[[198, 18, 0, 0], 15], // benchmarking
	[[198, 51, 100, 0], 24], // documentation
	[[203, 0, 113, 0], 24], // documentation
	[[224, 0, 0, 0], 4], // multicast
	[[240, 0, 0, 0], 4], // reserved, broadcast
];

function publicIpv4(octets: number[]): boolean {
	const value = toInt(octets);
	return !PRIVATE_V4.some(([start, bits]) => {
		const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
		return (value & mask) >>> 0 === (toInt(start) & mask) >>> 0;
	});
}

function toInt(octets: number[]): number {
	return (
		((octets[0]! << 24) |
			(octets[1]! << 16) |
			(octets[2]! << 8) |
			octets[3]!) >>>
		0
	);
}

/**
 * Only global unicast (2000::/3), less documentation (2001:db8::/32), Teredo
 * (2001::/32) and 6to4 (2002::/16), which carry an IPv4 address inside;
 * an IPv4-mapped or NAT64 address is judged by the IPv4 address it holds.
 */
function publicIpv6(address: string): boolean {
	const words = expand(address);
	if (!words) return false;
	const embedded = (): number[] => [
		words[6]! >> 8,
		words[6]! & 0xff,
		words[7]! >> 8,
		words[7]! & 0xff,
	];
	// ::ffff:a.b.c.d and the NAT64 prefix 64:ff9b::/96.
	if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff)
		return publicIpv4(embedded());
	if (
		words[0] === 0x64 &&
		words[1] === 0xff9b &&
		words.slice(2, 6).every((word) => word === 0)
	)
		return publicIpv4(embedded());
	const first = words[0]!;
	if (first < 0x2000 || first > 0x3fff) return false;
	if (first === 0x2002) return false;
	if (first === 0x2001 && (words[1] === 0x0db8 || words[1] === 0)) return false;
	return true;
}

/** Eight 16-bit words, or null; the URL parser has already normalised it. */
function expand(address: string): number[] | null {
	const halves = address.split("::");
	if (halves.length > 2) return null;
	const words = (text: string) =>
		text ? text.split(":").map((word) => parseInt(word, 16)) : [];
	const head = words(halves[0] ?? "");
	const tail = halves.length === 2 ? words(halves[1] ?? "") : [];
	const fill = 8 - head.length - tail.length;
	if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
	const all = [...head, ...new Array<number>(fill).fill(0), ...tail];
	return all.every(
		(word) => Number.isInteger(word) && word >= 0 && word <= 0xffff,
	)
		? all
		: null;
}
