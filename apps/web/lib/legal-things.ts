/**
 * The terms and the privacy notice for a library of things: the same text,
 * with each passage that speaks of books said of things instead. Pairs of
 * exact passages, so nothing else in the legal text moves; a passage that has
 * no place in a library of things (ISBN lookups) becomes empty and is left out.
 */
const PASSAGES: [string, string][] = [
	// Terms, English.
	[
		"Members lend each other books they own. The site only keeps the record: who offers what, who asked, who agreed, and who holds a book right now.",
		"Members lend each other things they own. The site only keeps the record: who offers what, who asked, who agreed, and who has something right now.",
	],
	["children's books for the family", "children's things for the family"],
	["The books are your own", "Your things are your own"],
	[
		"Your books stay your responsibility. This site is not a party to a loan, does not guarantee a book comes back, and takes no responsibility whatsoever for the books themselves — for loss, damage, theft, delay, or the state a book comes back in.",
		"Your things stay your responsibility. This site is not a party to a loan, does not guarantee anything comes back, and takes no responsibility whatsoever for the things themselves — for loss, damage, theft, delay, or the state they come back in. Tools and gear can injure people. Lend only what is safe to use, and tell the borrower what they need to know: how to use it, what it needs, and any fault. Use what you borrow with care, only for what it is meant for, and only if you know how. Whether something is safe to lend or to use is for the owner and the borrower to judge; this site does not check, inspect or vouch for anything listed here.",
	],
	[
		"the books you list, and the messages on each loan",
		"the things you list, and the messages on each loan",
	],
	["Covers and content", "Photos and content"],
	[
		"Books, covers and notes come from members or from public book databases. We keep our own copy of a cover",
		"Items, photos and notes come from members. We keep our own copy of a photo",
	],
	// Terms, Hebrew.
	[
		"חברים משאילים זה לזה ספרים שבבעלותם. האתר רק רושם: מי מציע מה, מי ביקש, מי אישר, ומי מחזיק ספר כרגע.",
		"חברים משאילים זה לזה דברים שבבעלותם. האתר רק רושם: מי מציע מה, מי ביקש, מי אישר, ומי מחזיק בפריט כרגע.",
	],
	["הספרים באחריותכם", "הדברים באחריותכם"],
	[
		"הספרים הם שלכם, והם נשארים באחריותכם. האתר אינו צד להשאלה, אינו מבטיח שספר יוחזר, ואינו אחראי במאום לספרים עצמם — לאובדן, לנזק, לגניבה, לאיחור או למצב שבו הספר חוזר. מי שמשאיל ספר עושה זאת על אחריותו בלבד.",
		"הדברים הם שלכם, והם נשארים באחריותכם. האתר אינו צד להשאלה, אינו מבטיח שפריט יוחזר, ואינו אחראי במאום לדברים עצמם — לאובדן, לנזק, לגניבה, לאיחור או למצב שבו הם חוזרים. מי שמשאיל משהו עושה זאת על אחריותו בלבד. כלים וציוד עלולים לגרום לפציעה. השאילו רק מה שבטוח לשימוש, והסבירו לשואל מה שעליו לדעת: איך משתמשים, מה צריך ואם יש תקלה. השתמשו במה ששאלתם בזהירות, רק למטרה שלשמה נועד, ורק אם אתם יודעים איך. ההחלטה אם משהו בטוח להשאלה או לשימוש היא של הבעלים ושל השואל; האתר אינו בודק, אינו מאשר ואינו ערב לשום דבר שמוצע בו.",
	],
	["הספרים שרשמתם, וההודעות בכל השאלה", "הפריטים שרשמתם, וההודעות בכל השאלה"],
	["ספרי עבר נשמרים בלי שם", "השאלות קודמות נשמרות בלי שם"],
	["כריכות ותוכן", "תמונות ותוכן"],
	[
		"הספרים, הכריכות וההערות מגיעים מהחברים או ממאגרי ספרים ציבוריים. אנחנו שומרים עותק של הכריכה אצלנו",
		"הפריטים, התמונות וההערות מגיעים מהחברים. אנחנו שומרים עותק של התמונה אצלנו",
	],
	// Privacy, English.
	[
		"The books you list: title, author, condition, notes and tags, and a cover if you upload one or one is found.",
		"The things you list: name, how many, the details you write about them, condition, notes and category, and a photo if you upload one.",
	],
	[
		"the books you list, and the messages you write on a loan",
		"the things you list, and the messages you write on a loan",
	],
	[
		"the database and the covers, and sends the email",
		"the database and the photos, and sends the email",
	],
	[
		"When you look up an ISBN we ask Google Books and Open Library. The number goes, you do not. Our own server fetches the cover image and keeps a copy, so your browser never talks to them.",
		"",
	],
	["so a book's history stays whole", "so an item's history stays whole"],
	// Privacy, Hebrew.
	[
		"הספרים שרשמתם: כותר, מחבר, מצב, הערות ותגיות, והכריכה אם העליתם או נמצאה.",
		"הפריטים שרשמתם: שם, כמות, הפרטים שכתבתם עליהם, מצב, הערות וקטגוריה, והתמונה אם העליתם.",
	],
	[
		"הספרים שרשמתם, וההודעות שאתם כותבים בהשאלה",
		"הפריטים שרשמתם, וההודעות שאתם כותבים בהשאלה",
	],
	["ואת הכריכות, ושולחת", "ואת התמונות, ושולחת"],
	[
		"בחיפוש לפי מסת״ב אנחנו שואלים את Google Books ואת Open Library. נשלח המספר בלבד, לא אתם. את תמונת הכריכה מביא השרת שלנו ושומר עותק, כך שהדפדפן שלכם לא פונה אליהם.",
		"",
	],
	["כדי שההיסטוריה של הספר תישאר שלמה", "כדי שההיסטוריה של הפריט תישאר שלמה"],
];

/** A legal passage as a library of things says it; empty when it does not apply. */
export function forThings(text: string): string {
	let said = text;
	for (const [books, things] of PASSAGES) {
		if (said.includes(books)) said = said.split(books).join(things);
	}
	return said;
}
