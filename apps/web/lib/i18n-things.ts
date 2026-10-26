/**
 * The words of a library of things (decision 0031): the same keys as the
 * dictionary in i18n.ts, said about tools, gear and whatever else neighbours
 * lend rather than books. strings() lays these over the book words when the
 * library's type is "things"; a key missing here keeps its book wording, so
 * only what mentions books, shelves, reading, covers or authors is here.
 *
 * A further library type gets a file like this one.
 */
export const thingWords = {
	en: {
		firstBook: "Add one thing you are happy to lend.",
		startAssistantShort:
			"A shed full of things? An assistant can list them for you.",
		setupAreaHint:
			"Roughly where you live, so neighbours see how far a thing is. Not your address.",
		setupPlaceHint: "Usually your home address.",
		setupBookTitle: "Your first thing",
		editBook: "Correct this item's details",
		editBookHint: "Moderators only. This changes the item's name and photo.",
		statReaders: "Different borrowers",
		statBooks: "Things listed",
		statBorrowed: "Things borrowed",
		manageCopy: "Manage this item",
		suggestTagHint:
			"Write it in your own words. A moderator turns it into a category in both languages, and it appears on this item once they do.",
		tagRemoveHint: "It comes off every item that carries it.",
		tagBuiltin: "Built in: the library starts with it, so it stays.",
		tagRemoved: "Removed, and taken off every item that had it.",
		tagsLegend: "Category",
		lendLimit: "Things out at once, at most",
		lendLimitHint:
			"While you are at your limit your things stay listed, marked as fully lent out, and nobody can ask for another.",
		awayHint:
			"Going away? Give the day you are back. Your things stay listed, marked as away, and nobody can ask for them until then.",
		awayNowHint:
			"You are away. Your things cannot be asked for until the day above; clear the date to come back sooner.",
		searchPlaceholder: "What are you looking for?",
		shelf: "My things",
		addCopy: "Add a thing",
		title: "Name",
		relay: "May pass straight to the next borrower",
		cover: "Photo",
		coverHint:
			"Drag the photo, or move it with the arrow keys, to place it inside the frame.",
		notFound: "That page is not here",
		notFoundHint:
			"The link may be old, or the item may have been taken off the list. Nothing is lost: the rest of the library is where you left it.",
		emptyShelf: "Nothing listed yet.",
		workNote: "About this item",
		workNoteFromCopy:
			"Filled in from the note one owner wrote. Keep what describes the item itself before saving.",
		areaRequired: "Set your area first — distances depend on it.",
		extendWaiting:
			"Someone is waiting for this, so only the owner can extend it.",
		reportHint:
			"Goes to the moderators only. Nothing is decided automatically; something lost comes off the list.",
		bookTurnedUp: "It turned up",
		waitlistJoin: "Tell me when one is free",
		waitlistJoined:
			"You are on the list. You get first dibs when one frees up.",
		waitlistHint: "None can be asked for right now.",
		relayingHint:
			"Things you have that go straight to the next borrower. Arrange the handoff on each loan.",
		availabilityHint:
			"Tick the times you can usually hand something over. Slots you share with the other person are offered first.",
		meetingPlacePrivacy:
			"Shown only to the person you are handing something to, and only after a time is agreed.",
		needsTimeHint:
			"Accepted a day ago and no time yet. Pick one below so it can change hands.",
		consentHint:
			"Only looking is ticked. Tick the rest only if you want it to act for you — sending messages, asking for things. You can disconnect it any time from your profile. It can never see other members' addresses or emails.",
		wantedHint:
			"We put you on its waitlist. The first one anyone lists is held for you for 48 hours.",
		wantedAsk: "Ask for this",
		haveIt: "Have one? Add yours",
		ogTagline: "neighbourhood library of things",
		webhooksIntro:
			"Get a signed POST when something happens: an item listed, a loan accepted, a handoff confirmed. Delivered at least once, retried for a day, then dropped.",
		nothingYetHint: "Be the first: add something you are happy to lend.",
		emptyShelfHint: "Type what it is — it takes a minute.",
		assets: "Things",
		assetSearch: "Name or owner",
		noAssets: "Nothing matches.",
		noRequestsHint: "Find something in the library and ask for it.",
		adminLoansBook: "Item",
		eraseHint:
			"Their address, name, area, meeting place, messages, devices and connected apps go, and their things come off the list. Past loans stay, with no name on their side. This cannot be undone. Not possible while they have an open loan, or while they are an admin.",
		myTagging: "Sort my things",
		myTaggingHint:
			"Tick what fits. A category that is missing, typed in, goes to the moderators as a suggestion and appears on the item once they approve. Enter saves.",
		myTaggingLink: "Sort my things quickly",
		settingsSizeHint:
			"In a library spread over a neighbourhood or a town, members give a rough area, and things show how far away they are. Where everyone lives a few minutes apart (a building, a street, a congregation), that tells nobody anything: the area, the map and distances are left out.",
		taggingWhich: "Things",
		taggingDone: "Everything has a category. Nothing left to sort.",
		taggingNone: "Nothing listed yet.",
		settleReturned: "It came back",
		settleLost: "It is lost",
		settleLostConfirm:
			"Mark it lost? It comes off the list until somebody puts it back.",
		settleHint:
			"Nobody can message or nudge a suspended member. Close the loan once you know where the thing is.",
		viewBookPage: "See its page",
		copyLocked: "This item has a loan in progress. Settle it first.",
		coverFailed: "The photo could not be saved. Try a smaller image.",
		replaceCover: "Replace the photo",
		removeFromShelf: "Remove this from my things",
		removed: "Removed from your things.",
		statCopies: "items",
		navBooks: "Things",
		colCopies: "Items",
		onTheShelves: "In the library near you",
		guestShelves: "In the library",
		allBooks: "Everything",
		wishlist: "Want to borrow",
		wishlistTab: "Saved",
		wishlistEmptyHint:
			"Tap “Want to borrow” on an item to keep it here. You'll hear when one near you is free.",
		nothingYet: "Nothing to borrow yet. Add something to get things moving.",
		noSuchBook: "No such item.",
		copiesNearby: "Who has it",
		noCopies: "Nobody nearby can lend one right now.",
		requestTaken: "Someone else has an open request on this.",
		youRequested: "You have asked for this.",
		incoming: "Requests for my things",
		noIncoming: "Nobody is asking for your things right now.",
	},
	he: {
		firstBook: "הוסיפו פריט אחד שאתם שמחים להשאיל.",
		startAssistantShort: "מחסן מלא? עוזר יכול לרשום הכול בשבילכם.",
		setupAreaHint:
			"בערך איפה אתם גרים, כדי שהשכנים יראו כמה רחוק הפריט. לא הכתובת.",
		setupPlaceHint: "בדרך כלל כתובת הבית.",
		setupBookTitle: "הפריט הראשון",
		editBook: "תיקון פרטי הפריט",
		editBookHint: "למודרטורים בלבד. השינוי משנה את השם והתמונה של הפריט.",
		statReaders: "שואלים שונים",
		statBooks: "פריטים רשומים",
		statBorrowed: "פריטים ששאלתם",
		manageCopy: "ניהול הפריט",
		suggestTagHint:
			"כתבו במילים שלכם. מודרטור/ית יהפכו את זה לקטגוריה בשתי השפות, ואז היא תופיע על הפריט הזה.",
		tagRemoveHint: "היא תוסר מכל פריט שמסומן בה.",
		tagBuiltin: "מובנית: הספרייה מתחילה איתה, ולכן היא נשארת.",
		tagRemoved: "הוסרה, וירדה מכל פריט שהיה מסומן בה.",
		tagsLegend: "קטגוריה",
		lendLimit: "כמה פריטים מושאלים במקביל, לכל היותר",
		lendLimitHint:
			"כשמגיעים למכסה הפריטים שלכם נשארים ברשימה ומסומנים כמושאלים במלואם, ואי אפשר לבקש עוד אחד.",
		awayHint:
			"נוסעים? כתבו את היום שבו אתם חוזרים. הפריטים נשארים ברשימה, מסומנים כלא זמינים, ואי אפשר לבקש אותם עד אז.",
		awayNowHint:
			"אתם בחופשה. אי אפשר לבקש את הפריטים שלכם עד התאריך שלמעלה; מחקו את התאריך כדי לחזור מוקדם יותר.",
		searchPlaceholder: "מה אתם מחפשים?",
		shelf: "הפריטים שלי",
		addCopy: "הוספת פריט",
		title: "שם",
		relay: "אפשר להעביר ישירות לשואל/ת הבא/ה",
		cover: "תמונה",
		coverHint:
			"גררו את התמונה, או הזיזו אותה במקשי החצים, כדי למקם אותה בתוך המסגרת.",
		notFound: "העמוד הזה לא כאן",
		notFoundHint:
			"אולי הקישור ישן, או שהפריט ירד מהרשימה. שום דבר לא אבד, ושאר הספרייה נשארה במקום.",
		emptyShelf: "עדיין לא נוספו פריטים.",
		workNote: "על הפריט",
		workNoteFromCopy:
			"מולא מההערה שכתב/ה אחד הבעלים. השאירו רק את מה שמתאר את הפריט עצמו לפני השמירה.",
		areaRequired: "קודם קבעו את האזור שלכם — המרחקים תלויים בו.",
		extendWaiting: "מישהו מחכה לזה, אז רק הבעלים יכולים להאריך.",
		reportHint:
			"מגיע רק למודרטורים. שום דבר לא נקבע אוטומטית; משהו שאבד יורד מהרשימה.",
		bookTurnedUp: "נמצא",
		waitlistJoin: "עדכנו אותי כשמתפנה",
		waitlistJoined: "אתם ברשימה. כשיתפנה תקבלו זכות ראשונים.",
		waitlistHint: "אי אפשר לבקש כרגע.",
		relayingHint:
			"פריטים שאצלכם שעוברים ישירות לשואל/ת הבא/ה. תאמו מסירה בכל השאלה.",
		availabilityHint:
			"סמנו מתי בדרך כלל נוח לכם למסור משהו. זמנים משותפים עם הצד השני מוצעים קודם.",
		meetingPlacePrivacy: "מוצג רק למי שמקבל/ת מכם משהו, ורק אחרי שנקבע מועד.",
		needsTimeHint:
			"אושר לפני יום ועוד אין מועד. בחרו אחד למטה כדי שזה יעבור ידיים.",
		consentHint:
			"מסומנת רק צפייה. סמנו את השאר רק אם אתם רוצים שהיא תפעל בשמכם — תשלח הודעות, תבקש דברים. אפשר לנתק בכל עת מהפרופיל. היא לעולם לא תראה כתובות או אימיילים של חברים אחרים.",
		wantedHint:
			"נרשום אותו ברשימת ההמתנה שלכם. הראשון שיירשם יישמר לכם ל־48 שעות.",
		wantedAsk: "בקשה",
		haveIt: "יש לכם? הוסיפו",
		ogTagline: "ספריית חפצים שכונתית",
		webhooksIntro:
			"קבלו POST חתום כשמשהו קורה: פריט נרשם, השאלה אושרה, מסירה אושרה. נמסר לפחות פעם אחת, מנסה שוב במשך יום, ואז נזנח.",
		nothingYetHint: "היו הראשונים: הוסיפו משהו שאתם שמחים להשאיל.",
		emptyShelfHint: "כתבו מה זה — זה לוקח דקה.",
		assets: "פריטים",
		assetSearch: "שם או בעלים",
		noAssets: "אין פריטים תואמים.",
		noRequestsHint: "מצאו משהו בספרייה ובקשו אותו.",
		adminLoansBook: "פריט",
		eraseHint:
			"הכתובת, השם, האזור, מקום המפגש, ההודעות, המכשירים והאפליקציות המחוברות נמחקים, והפריטים יורדים מהרשימה. השאלות שהיו נשארות, בלי שם בצד שלהם. אי אפשר לבטל. לא אפשרי כשיש להם השאלה פתוחה, או כשהם מנהלים.",
		myTagging: "מיון הפריטים שלי",
		myTaggingHint:
			"סמנו מה שמתאים. קטגוריה חסרה שמוקלדת נשלחת למודרטורים כהצעה, ומופיעה על הפריט כשהם מאשרים. Enter שומר.",
		myTaggingLink: "מיון מהיר של הפריטים שלי",
		settingsSizeHint:
			"בספרייה שפרוסה על שכונה או עיר, החברים מציינים אזור משוער, והפריטים מראים כמה הם רחוקים. כשכולם גרים במרחק כמה דקות זה מזה (בניין, רחוב, קהילה), זה לא אומר כלום: האזור, המפה והמרחקים לא מוצגים.",
		taggingWhich: "פריטים",
		taggingDone: "לכל הפריטים יש קטגוריה. לא נשאר מה למיין.",
		taggingNone: "אין עדיין פריטים.",
		settleReturned: "חזר",
		settleLost: "אבד",
		settleLostConfirm: "לסמן שאבד? הוא יורד מהרשימה עד שמישהו יחזיר אותו.",
		settleHint:
			"אי אפשר לשלוח הודעות או תזכורות לחבר מושעה. סגרו את ההשאלה כשברור איפה הפריט.",
		viewBookPage: "לעמוד הפריט",
		copyLocked: "לפריט הזה יש השאלה בתהליך. סיימו אותה קודם.",
		coverFailed: "התמונה לא נשמרה. נסו תמונה קטנה יותר.",
		replaceCover: "החלפת תמונה",
		removeFromShelf: "הסרה מהפריטים שלי",
		removed: "הוסר מהפריטים שלכם.",
		statCopies: "פריטים",
		navBooks: "פריטים",
		colCopies: "פריטים",
		onTheShelves: "בספרייה לידכם",
		guestShelves: "בספרייה",
		allBooks: "הכול",
		wishlist: "רוצה לשאול",
		wishlistTab: "שמורים",
		wishlistEmptyHint:
			"לחצו על „רוצה לשאול” בעמוד של פריט כדי לשמור אותו כאן. תקבלו הודעה כשאחד קרוב יתפנה.",
		nothingYet: "אין עדיין מה לשאול. הוסיפו משהו כדי להתחיל.",
		noSuchBook: "אין פריט כזה.",
		copiesNearby: "למי יש",
		noCopies: "לאף אחד בסביבה אין כרגע להשאיל.",
		requestTaken: "למישהו אחר יש כבר בקשה פתוחה על זה.",
		youRequested: "ביקשתם את זה.",
		incoming: "בקשות לפריטים שלי",
		noIncoming: "אף אחד לא מבקש כרגע את הפריטים שלכם.",
	},
} as const;

/** The sentence-making helpers of i18n.ts that speak of books, said of things. */
export function thingHelpers(locale: "en" | "he") {
	const he = locale === "he";
	const plural = (n: number, one: string, many: string) =>
		n === 1 ? one : many;
	return {
		assistantCan: he
			? [
					"לחפש בקטלוג ולראות מה זמין לידכם",
					"לרשום חפצים משלכם, כולל תמונות",
					"לבקש חפץ, לאשר או לדחות בקשות, לשלוח הודעות בהשאלה",
					"להזכיר בעדינות (פעם ביום)",
					"למודרטורים: לתקן כל פריט ואת התמונה שלו, ולנהל את הקטגוריות",
				]
			: [
					"Search the catalogue and see what is available near you",
					"List your own things, photos included",
					"Ask for a thing, answer requests, message on a loan",
					"Send a gentle reminder (once a day)",
					"For moderators: correct any item and its photo, and keep the categories",
				],
		counterpartSuspendedBody: (name: string) =>
			he
				? `המודרטורים של הספרייה השעו את החשבון של \u2068${name}\u2069, ולכן הודעות ותזכורות כבר לא מגיעות אליו. כדי להסדיר את ההשאלה, להחזיר או לקבל את מה שהושאל או כל דבר אחר, כתבו למודרטורים.`
				: `The library's moderators suspended \u2068${name}\u2069, so messages and nudges no longer reach them. To sort out this loan, whether it is getting the thing back or anything else, write to the moderators.`,
		reportRelayHint: (owner: string) =>
			he
				? `הפריט הזה עבר אליכם מהשואל/ת הקודם/ת. דיווח על נזק יגיע גם ל${owner}, הבעלים, שלא היו במסירה.`
				: `This was passed to you by the previous borrower. A damage report also reaches ${owner}, who owns it and was not at the handover.`,
		awayShelf: (date: string) =>
			he
				? `אתם בחופשה עד ${date}. אי אפשר לבקש את הפריטים שלכם עד אז.`
				: `You are away until ${date}. Nobody can ask for your things until then.`,
		offerHeld: (until: string) =>
			he ? `שמור לכם עד ${until}.` : `One is held for you until ${until}.`,
		addedCopy: (title: string) =>
			he ? `«${title}» נוסף לפריטים שלך.` : `“${title}” is listed.`,
		teaserCounts: (copies: number, waiting: number) =>
			he
				? `${copies} ${plural(copies, "פריט", "פריטים")} בקהילה · ${waiting} ${plural(waiting, "ממתין/ה", "ממתינים")}`
				: `${copies} ${plural(copies, "item", "items")} in the community · ${waiting} waiting`,
		booksTotal: (n: number) =>
			he
				? n === 1
					? "פריט אחד"
					: `${n} פריטים`
				: `${n} ${plural(n, "thing", "things")}`,
		copiesSummary: (total: number, free: number) =>
			he
				? `${total} ${plural(total, "פריט", "פריטים")}, ${free} ${plural(free, "זמין", "זמינים")}`
				: `${total} ${plural(total, "item", "items")}, ${free} free`,
		inviteMessage: (community: string) =>
			he
				? `אני בספרייה השכונתית של ${community} — משאילים דברים בין שכנים. מצטרפים כאן:`
				: `I am in the ${community} neighbourhood library — neighbours lending each other things. Join here:`,
		booksFrom: (name: string) =>
			name
				? he
					? `פריטים של ${name}`
					: `Things from ${name}`
				: he
					? "פריטים של חבר/ה בקהילה"
					: "Things from this member",
		otherBooksFrom: (name: string) =>
			he ? `עוד פריטים של ${name}` : `More from ${name}`,
	};
}

/** A thing on its owner's shelf is at home, not on a shelf. */
export const thingStates = {
	en: { shelved: "at its owner's" },
	he: { shelved: "אצל הבעלים" },
} as const;
