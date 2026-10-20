import { describe, expect, it } from "vitest";
import { render } from "./templates.ts";

const all = (rendered: { subject: string; text: string }) =>
	`${rendered.subject}\n${rendered.text}`;

describe("messages in a library of things", () => {
	for (const locale of ["en", "he"] as const) {
		it(`do not call a thing a book (${locale})`, () => {
			const invitation = render({
				kind: "invitation",
				libraryType: "things",
				to: "noa@example.com",
				locale,
				url: "https://library.example.org/auth/callback?token=x",
				inviterName: "Dana",
				communityName: "Staging",
				expiresInDays: 14,
			});
			const offer = render({
				kind: "waitlist_offer",
				libraryType: "things",
				to: "noa@example.com",
				locale,
				url: "https://library.example.org/works/x",
				bookTitle: "Ladder",
				ownerName: "Sam",
				hours: 48,
			});
			for (const text of [all(invitation), all(offer)])
				expect(text).not.toMatch(/\bbook|ספר(?!ייה|יית)/i);
		});
	}

	it("still speak of books in a books library", () => {
		const invitation = render({
			kind: "invitation",
			to: "noa@example.com",
			locale: "en",
			url: "https://our-street.example.org/auth/callback?token=x",
			inviterName: "Dana",
			communityName: "Our Street",
			expiresInDays: 14,
		});
		expect(all(invitation)).toContain("lend each other books");
	});
});

describe("a subject", () => {
	it("is one line, whatever a name carries", () => {
		const request = render({
			kind: "loan_request",
			to: "dana@example.com",
			locale: "en",
			url: "https://library.example.org/loans/x",
			borrowerName: "Sam\r\nBcc: everyone@example.com",
			bookTitle: "Two\nlines",
			note: null,
			relay: false,
		});
		expect(request.subject).not.toMatch(/[\r\n]/);
		expect(request.subject).toContain("Sam Bcc: everyone@example.com");
	});
});
