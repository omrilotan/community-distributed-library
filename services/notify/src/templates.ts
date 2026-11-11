import type {
	ContactMessage,
	CopyDamageMessage,
	HandoffMessage,
	LoanDecisionMessage,
	LoanMessageMessage,
	LoanNudgeMessage,
	LoanReminderMessage,
	LoanRequestMessage,
	ModeratorDigestMessage,
	WaitlistOfferMessage,
	WishlistMessage,
	MagicLinkMessage,
	InvitationMessage,
	PushTestMessage,
	Message,
	ReportMessage,
	ReportUpdateMessage,
} from "@cdl/contracts";

export interface Rendered {
	subject: string;
	text: string;
	html: string;
}

/** Plain, short, bilingual. Emails are localised per member (decision 0011). */
export function render(message: Message): Rendered {
	const rendered = compose(message);
	// A subject is one header line, and a notification's title one line: a
	// name or title carrying a line break would have the email refused.
	return { ...rendered, subject: rendered.subject.replace(/\s+/g, " ").trim() };
}

function compose(message: Message): Rendered {
	switch (message.kind) {
		case "magic_link":
			return magicLink(message);
		case "invitation":
			return invitation(message);
		case "push_test":
			return pushTest(message);
		case "loan_request":
			return loanRequest(message);
		case "loan_decision":
			return loanDecision(message);
		case "loan_message":
			return loanMessage(message);
		case "loan_nudge":
			return loanNudge(message);
		case "loan_reminder":
			return loanReminder(message);
		case "librarian_digest":
			return moderatorDigest(message);
		case "handoff":
			return handoff(message);
		case "waitlist_offer":
			return waitlistOffer(message);
		case "wishlist_available":
			return wishlistAvailable(message);
		case "report":
			return report(message);
		case "report_update":
			return reportUpdate(message);
		case "contact":
			return contact(message);
		case "copy_damage":
			return copyDamage(message);
	}
}

function magicLink(message: MagicLinkMessage): Rendered {
	const copy =
		message.locale === "he"
			? {
					subject: "קישור הכניסה שלך לספריית הקהילה",
					lead: "לחצו כדי להיכנס:",
					code: "נפתח באפליקציה אחרת? הקלידו את הקוד הזה במקום שבו ביקשתם. אל תמסרו אותו לאיש:",
					tail: `תקף ל־${message.expiresInMinutes} דקות ולשימוש אחד. הגיע לספאם? סמנו "לא ספאם". לא ביקשתם? אפשר להתעלם.`,
				}
			: {
					subject: "Your sign-in link for the Community Library",
					lead: "Tap to sign in:",
					code: "Opened in another app? Type this code where you asked. Never share it:",
					tail: `Works for ${message.expiresInMinutes} minutes, once. In junk? Mark it "not junk". Did not ask? Ignore this.`,
				};
	return wrap(
		message.locale,
		copy.subject,
		copy.lead,
		message.url,
		copy.tail,
		message.code ? { label: copy.code, value: message.code } : undefined,
	);
}

/** Only ever pushed: it checks a device, so it never becomes an email. */
function pushTest(message: PushTestMessage): Rendered {
	const copy =
		message.locale === "he"
			? {
					subject: "ההתראות עובדות",
					lead: "כך ייראו התראות מהספרייה במכשיר הזה.",
					tail: "",
				}
			: {
					subject: "Notifications work",
					lead: "This is how the library's notifications look on this device.",
					tail: "",
				};
	return wrap(message.locale, copy.subject, copy.lead, message.url, copy.tail);
}

function invitation(message: InvitationMessage): Rendered {
	const copy =
		message.locale === "he"
			? {
					subject: `הזמנה ל${message.communityName} מ${message.inviterName}`,
					lead:
						message.libraryType === "things"
							? "ספרייה שכונתית שבה שכנים משאילים זה לזה דברים: כלים, ציוד ומה שעוד יש להם. לחצו על הקישור כדי להצטרף:"
							: "ספרייה שכונתית שבה שכנים משאילים זה לזה ספרים. לחצו על הקישור כדי להצטרף:",
					tail: `הקישור תקף ל־${message.expiresInDays} ימים ולשימוש אחד, והוא גם מכניס אתכם. אם ההודעה הגיעה לספאם, סמנו אותה כ"לא ספאם" והוסיפו אותנו לאנשי הקשר. אם לא ציפיתם לה, אפשר להתעלם.`,
				}
			: {
					subject: `${message.inviterName} invited you to the ${message.communityName}`,
					lead:
						message.libraryType === "things"
							? "A neighbourhood library where people lend each other things: tools, gear and whatever else they have. Click the link to join:"
							: "A neighbourhood library where people lend each other books. Click the link to join:",
					tail: `The link works for ${message.expiresInDays} days and only once, and signs you in. If this landed in your junk folder, mark it "not junk" and add us to your contacts. If you were not expecting it, ignore it.`,
				};
	return wrap(message.locale, copy.subject, copy.lead, message.url, copy.tail);
}

function loanRequest(message: LoanRequestMessage): Rendered {
	const note = message.note ? `\n\n“${message.note}”` : "";
	const relayNote = message.relay
		? message.locale === "he"
			? message.libraryType === "things"
				? "\n\nהפריט כרגע אצל שואל/ת אחר/ת; אם תאשרו, הוא יעבור ישירות הלאה במקום לחזור אליכם קודם."
				: "\n\nהספר כרגע אצל קורא/ת אחר/ת; אם תאשרו, הוא יעבור ישירות הלאה במקום לחזור אליכם קודם."
			: message.libraryType === "things"
				? "\n\nIt is currently with another borrower; if you accept, it passes straight on instead of coming back to you first."
				: "\n\nThe book is currently with another reader; if you accept, it passes straight on instead of coming back to you first."
		: "";
	const copy =
		message.locale === "he"
			? {
					subject: `${message.borrowerName} רוצה לשאול את «${message.bookTitle}»`,
					lead: `${message.borrowerName} מבקש/ת לשאול את «${message.bookTitle}».${note}${relayNote}`,
					tail: "אשרו או דחו בעמוד ההשאלות. אין חובה להסביר.",
				}
			: {
					subject: `${message.borrowerName} would like to borrow “${message.bookTitle}”`,
					lead: `${message.borrowerName} is asking to borrow “${message.bookTitle}”.${note}${relayNote}`,
					tail: "Accept or decline on your loans page. No explanation needed.",
				};
	return wrap(message.locale, copy.subject, copy.lead, message.url, copy.tail);
}

function loanDecision(message: LoanDecisionMessage): Rendered {
	const copy =
		message.locale === "he"
			? message.accepted
				? {
						subject: `«${message.bookTitle}» — ${message.lenderName} אישר/ה`,
						lead: `${message.lenderName} אישר/ה את בקשתכם לשאול את «${message.bookTitle}». הספר שמור לכם.`,
						tail: "השלב הבא: לתאם מסירה בעמוד ההשאלות.",
					}
				: {
						subject: `«${message.bookTitle}» — לא הפעם`,
						lead: `${message.lenderName} לא יכול/ה להשאיל את «${message.bookTitle}» כרגע.`,
						tail: "אולי יש עותק אחר בסביבה.",
					}
			: message.accepted
				? {
						subject: `“${message.bookTitle}” — ${message.lenderName} said yes`,
						lead: `${message.lenderName} accepted your request for “${message.bookTitle}”. It is reserved for you.`,
						tail: "Next: arrange the handoff on your loans page.",
					}
				: {
						subject: `“${message.bookTitle}” — not this time`,
						lead: `${message.lenderName} cannot lend “${message.bookTitle}” right now.`,
						tail: "There may be another copy nearby.",
					};
	return wrap(message.locale, copy.subject, copy.lead, message.url, copy.tail);
}

function loanMessage(message: LoanMessageMessage): Rendered {
	const copy =
		message.locale === "he"
			? {
					subject: `${message.fromName} על «${message.bookTitle}»`,
					lead: `${message.fromName} כתב/ה על «${message.bookTitle}»:\n\n“${message.body}”`,
					tail: "אפשר להשיב בעמוד ההשאלה.",
				}
			: {
					subject: `${message.fromName} about “${message.bookTitle}”`,
					lead: `${message.fromName} wrote about “${message.bookTitle}”:\n\n“${message.body}”`,
					tail: "Reply on the loan page.",
				};
	return wrap(message.locale, copy.subject, copy.lead, message.url, copy.tail);
}

function loanNudge(message: LoanNudgeMessage): Rendered {
	const he = message.locale === "he";
	const book = he ? `«${message.bookTitle}»` : `“${message.bookTitle}”`;
	const lead = {
		answer: he
			? `${message.fromName} עדיין מחכה לתשובה על ${book}.`
			: `${message.fromName} is still waiting for an answer about ${book}.`,
		handoff: he
			? `${message.fromName} מזכיר/ה: ${book} מאושר — נשאר לתאם מסירה.`
			: `${message.fromName} reminds you: ${book} is accepted — the handoff is still to arrange.`,
		due: he
			? `${message.fromName} מזכיר/ה: ${book} להחזרה בעוד ${message.days} ימים.`
			: `${message.fromName} reminds you: ${book} is due back in ${message.days} days.`,
		overdue: he
			? `${message.fromName} מזכיר/ה: ${book} באיחור של ${message.days} ימים.`
			: `${message.fromName} reminds you: ${book} is ${message.days} days overdue.`,
	}[message.stage];
	const subject = he ? `תזכורת על ${book}` : `A reminder about ${book}`;
	const tail = he ? "אפשר להשיב בעמוד ההשאלה." : "Reply on the loan page.";
	return wrap(message.locale, subject, lead, message.url, tail);
}

function loanReminder(message: LoanReminderMessage): Rendered {
	const he = message.locale === "he";
	const book = he ? `«${message.bookTitle}»` : `“${message.bookTitle}”`;
	const lead = {
		unanswered: he
			? `${message.otherName} ביקש/ה לשאול את ${book} לפני ${message.days} ימים ועדיין מחכה לתשובה.`
			: `${message.otherName} asked to borrow ${book} ${message.days} days ago and is still waiting for an answer.`,
		due_soon: he
			? `${book} של ${message.otherName} להחזרה בעוד ${message.days} ימים.`
			: `${book} from ${message.otherName} is due back in ${message.days} days.`,
		overdue: he
			? `${book} של ${message.otherName} באיחור של ${message.days} ימים.`
			: `${book} from ${message.otherName} is ${message.days} days overdue.`,
	}[message.stage];
	const subject = {
		unanswered: he ? `בקשה ממתינה: ${book}` : `A request is waiting: ${book}`,
		due_soon: he ? `להחזרה בקרוב: ${book}` : `Due soon: ${book}`,
		overdue: he ? `באיחור: ${book}` : `Overdue: ${book}`,
	}[message.stage];
	const tail = he
		? "תזכורת אוטומטית מהספרייה. אפשר להשיב בעמוד ההשאלה."
		: "An automatic reminder from the library. Reply on the loan page.";
	return wrap(message.locale, subject, lead, message.url, tail);
}

function moderatorDigest(message: ModeratorDigestMessage): Rendered {
	const he = message.locale === "he";
	const lines = message.items
		.map((item) =>
			he
				? `«${item.bookTitle}» — ${item.borrowerName} שאל/ה מ־${item.lenderName}, באיחור של ${item.daysOverdue} ימים`
				: `“${item.bookTitle}” — ${item.borrowerName} borrowed from ${item.lenderName}, ${item.daysOverdue} days overdue`,
		)
		.join("\n");
	const subject = he
		? `השאלות שצריכות תשומת לב (${message.items.length})`
		: `Loans that need a moderator (${message.items.length})`;
	const lead = he
		? `ההשאלות האלה עברו את קו ה־14 יום:\n\n${lines}`
		: `These loans crossed the 14-day line:\n\n${lines}`;
	const tail = he
		? "אין קנסות ואין חסימות — רק שיחה. הרשימה בעמוד הניהול."
		: "No fines, no blocking — a conversation. The list is on the moderator page.";
	return wrap(message.locale, subject, lead, message.url, tail);
}

function handoff(message: HandoffMessage): Rendered {
	const he = message.locale === "he";
	const book = he ? `«${message.bookTitle}»` : `“${message.bookTitle}”`;
	const period = {
		morning: he ? "בבוקר" : "in the morning",
		afternoon: he ? "אחר הצהריים" : "in the afternoon",
		evening: he ? "בערב" : "in the evening",
	}[message.period];
	const when = `${message.day} ${period}`;
	if (message.stage === "proposed") {
		return wrap(
			message.locale,
			he ? `הצעת מועד ל־${book}` : `A time for ${book}`,
			he
				? `${message.otherName} מציע/ה למסור את ${book} ב־${when}.`
				: `${message.otherName} proposes handing over ${book} ${when}.`,
			message.url,
			he
				? "אשרו בעמוד ההשאלה, או הציעו מועד אחר."
				: "Confirm on the loan page, or propose another time.",
		);
	}
	const details = [
		message.place
			? he
				? `איפה: ${message.place}`
				: `Where: ${message.place}`
			: null,
		message.code
			? he
				? `קוד המסירה: ${message.code} — הראו אותו לשואל/ת בפגישה`
				: `Handoff code: ${message.code} — read it out to the borrower when you meet`
			: null,
	]
		.filter(Boolean)
		.join("\n");
	return wrap(
		message.locale,
		he ? `נקבע: ${book}, ${when}` : `Agreed: ${book}, ${when}`,
		he
			? `${message.otherName} אישר/ה. ${book} ב־${when}.\n\n${details}`
			: `${message.otherName} confirmed. ${book} ${when}.\n\n${details}`,
		message.url,
		he ? "הפרטים גם בעמוד ההשאלה." : "The details are on the loan page too.",
	);
}

function waitlistOffer(message: WaitlistOfferMessage): Rendered {
	const he = message.locale === "he";
	const things = message.libraryType === "things";
	const book = he ? `«${message.bookTitle}»` : `“${message.bookTitle}”`;
	return wrap(
		message.locale,
		he ? `${book} פנוי — שמור לכם` : `${book} is free — held for you`,
		he
			? `${things ? "" : "עותק של "}${book} (של ${message.ownerName}) פנוי עכשיו. הוא שמור לכם ל־${message.hours} שעות; אחר כך יעבור לבא/ה בתור.`
			: `${things ? "" : "A copy of "}${book} (${message.ownerName}'s) is free now. It is held for you for ${message.hours} hours; after that it goes to the next in line.`,
		message.url,
		he
			? things
				? "בקשו אותו מעמוד הפריט."
				: "בקשו אותו מעמוד הספר."
			: things
				? "Request it from its page."
				: "Request it from the book page.",
	);
}

function wishlistAvailable(message: WishlistMessage): Rendered {
	const he = message.locale === "he";
	const things = message.libraryType === "things";
	const book = he ? `«${message.bookTitle}»` : `“${message.bookTitle}”`;
	return wrap(
		message.locale,
		he ? `${book} פנוי להשאלה` : `${book} is free to borrow`,
		he
			? things
				? `מהרשימה שלכם: ${book} (של ${message.ownerName}) פנוי עכשיו.`
				: `ספר מהרשימה שלכם: עותק של ${book} (של ${message.ownerName}) פנוי עכשיו.`
			: things
				? `From your list: ${book} (${message.ownerName}'s) is free now.`
				: `A book on your list: a copy of ${book} (${message.ownerName}'s) is free now.`,
		message.url,
		he
			? things
				? "בקשו אותו מעמוד הפריט."
				: "בקשו אותו מעמוד הספר."
			: things
				? "Ask for it from its page."
				: "Ask for it from the book page.",
	);
}

function report(message: ReportMessage): Rendered {
	const he = message.locale === "he";
	const kind =
		{
			damage: he ? "נזק" : "damage",
			loss: he ? "אובדן" : "loss",
			no_show: he ? "אי-הגעה" : "no-show",
			conduct: he ? "התנהגות" : "conduct",
			other: he ? "אחר" : "other",
		}[message.reportKind] ?? message.reportKind;
	const about = [
		message.bookTitle
			? he
				? `ספר: «${message.bookTitle}»`
				: `Book: “${message.bookTitle}”`
			: null,
		message.subjectName
			? he
				? `לגבי: ${message.subjectName}`
				: `About: ${message.subjectName}`
			: null,
		message.body ? `“${message.body}”` : null,
	]
		.filter(Boolean)
		.join("\n");
	return wrap(
		message.locale,
		he
			? `דיווח חדש (${kind}) מ־${message.reporterName}`
			: `New report (${kind}) from ${message.reporterName}`,
		he
			? `${message.reporterName} דיווח/ה על ${kind}.\n\n${about}`
			: `${message.reporterName} filed a ${kind} report.\n\n${about}`,
		message.url,
		he
			? "זה דורש אדם, לא מערכת. הרשימה בעמוד הניהול."
			: "This needs a person, not a system. The list is on the moderator page.",
	);
}

/**
 * A message for whoever runs the library. It carries the words themselves
 * rather than a link, because the person reading it may have to answer by
 * hand, and a data request has a clock on it.
 */
/** Your book, in somebody else's hands, with something to say about it. */
function copyDamage(message: CopyDamageMessage): Rendered {
	const he = message.locale === "he";
	const from = message.fromName
		? he
			? ` (הגיע מ${message.fromName})`
			: ` (passed on by ${message.fromName})`
		: "";
	const lead = he
		? `${message.reporterName} מדווח/ת שהספר «${message.bookTitle}» הגיע פגום${from}.`
		: `${message.reporterName} says “${message.bookTitle}” arrived damaged${from}.`;
	const tail = [
		message.body ? `“${message.body}”` : null,
		he
			? "המודרטורים קיבלו את אותו הדיווח. ההחלטה מה לעשות היא שלכם."
			: "The moderators have the same report. What to do about it is yours to decide.",
	]
		.filter(Boolean)
		.join("\n\n");
	return wrap(message.locale, lead, lead, message.url, tail);
}

function contact(message: ContactMessage): Rendered {
	const he = message.locale === "he";
	const topic =
		{
			feedback: he ? "משוב" : "feedback",
			data: he ? "בקשת מידע" : "data request",
			complaint: he ? "תלונה" : "complaint",
		}[message.topic] ?? message.topic;
	const who = message.fromName
		? `${message.fromName} <${message.fromEmail}>`
		: message.fromEmail;
	const subject = he ? `${topic} מ־${who}` : `Library ${topic} from ${who}`;
	const tail = he
		? "השיבו ישירות לכתובת הזו. בקשת מידע לפי חוק הגנת המידע — חודש לענות."
		: "Reply straight to that address. A data request under UK data protection law has one month to be answered.";
	return {
		subject,
		text: `${message.body}\n\n\u2014 ${who}\n\n${tail}\n`,
		html: `<!doctype html><html lang="${message.locale}" dir="${message.locale === "he" ? "rtl" : "ltr"}"><body style="font-family:system-ui,sans-serif;line-height:1.5">
<p style="white-space:pre-wrap">${escape(message.body)}</p>
<p>\u2014 ${escape(who)}</p>
<p style="color:#555">${escape(tail)}</p>
</body></html>`,
	};
}

function wrap(
	locale: "en" | "he",
	subject: string,
	lead: string,
	url: string,
	tail: string,
	/** A sign-in code, shown under the link: four digits, a space, four. */
	code?: { label: string; value: string },
): Rendered {
	const dir = locale === "he" ? "rtl" : "ltr";
	const spaced = code ? `${code.value.slice(0, 4)} ${code.value.slice(4)}` : "";
	return {
		subject,
		text: `${lead}\n\n${url}\n\n${code ? `${code.label}\n\n${spaced}\n\n` : ""}${tail}\n`,
		html: `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:system-ui,sans-serif;line-height:1.5">
<p>${escape(lead).replace(/\n/g, "<br>")}</p>
<p><a href="${escape(url)}">${escape(url)}</a></p>
${code ? `<p>${escape(code.label)}</p>\n<p dir="ltr" style="font-size:1.75em;font-weight:700;letter-spacing:0.1em">${escape(spaced)}</p>\n` : ""}<p style="color:#555">${escape(tail)}</p>
</body></html>`,
	};
}

function escape(value: string): string {
	return value.replace(
		/[&<>"]/g,
		(char) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!,
	);
}

/** A reply on a report, or what the moderators decided about it. */
function reportUpdate(message: ReportUpdateMessage): Rendered {
	const he = message.locale === "he";
	const about = message.bookTitle
		? he
			? ` («${message.bookTitle}»)`
			: ` (“${message.bookTitle}”)`
		: "";
	const lead =
		message.event === "reply"
			? message.toModerators
				? he
					? `תשובה חדשה בדיווח${about}`
					: `A new reply on a report${about}`
				: he
					? `המודרטורים כתבו לכם על הדיווח${about}`
					: `The moderators wrote about your report${about}`
			: message.event === "resolved"
				? he
					? `הדיווח שלכם טופל${about}`
					: `Your report has been dealt with${about}`
				: he
					? `הדיווח שלכם נסגר${about}`
					: `Your report was closed${about}`;
	return wrap(
		message.locale,
		lead,
		message.body ? `${lead}\n\n“${message.body}”` : lead,
		message.url,
		he
			? "התשובות גלויות רק לכם ולמודרטורים."
			: "Only you and the moderators see this.",
	);
}
