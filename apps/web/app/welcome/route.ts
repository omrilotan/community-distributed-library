import { NextResponse, type NextRequest } from "next/server";

/**
 * The settings page used to live here. Old links (a bookmark, an email sent
 * before the move) still arrive; send them on, query and all. The browser
 * carries a `#section` across the redirect by itself.
 */
export function GET(request: NextRequest) {
	const url = new URL(request.url);
	url.pathname = "/settings";
	return NextResponse.redirect(url, 308);
}
