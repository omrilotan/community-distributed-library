import type { SuggestedAccent } from "@cdl/contracts";
import { libraryType } from "./library-type.ts";
import { thingHelpers, thingStates, thingWords } from "./i18n-things.ts";
import { dateFormat } from "./dates.ts";
export const locales = ["en", "he"] as const;
export type Locale = (typeof locales)[number];

/**
 * Direction is set once, on <html>. Nothing else in the app branches on it —
 * logical CSS does the rest (packages/design/frontend-conventions.md).
 */
export function direction(locale: Locale): "ltr" | "rtl" {
	return locale === "he" ? "rtl" : "ltr";
}

const dictionary = {
	en: {
		appShort: "Library",
		about: "About",
		menu: "Menu",
		installApp: "Add to home screen",
		installIos:
			"Tap the share button at the bottom of Safari, then \u201cAdd to Home Screen\u201d.",
		checkJunk:
			"If it is not there in a minute, look in your junk or spam folder. The first one often lands there.",
		saveContact: "Save the library as a contact",
		saveContactWhy: "so the next one does not.",
		cookieNote:
			"We keep a little on your device — what signs you in, and small preferences like the language you read in. No tracking, no analytics, no advertising, and nothing about you is sold or handed on.",
		firstBook: "Add one book you are happy to lend.",
		startLede: "Neighbours lending each other the books they already own.",
		startSetupTitle: "Three short steps to set up",
		startAssistantShort: "A pile of books? An assistant can list them for you.",
		setupNext: "Next",
		setupLater: "Later",
		setupAreaTitle: "Your name and area",
		setupAreaHint:
			"Roughly where you live, so neighbours see how far a book is. Not your address.",
		setupPlaceTitle: "Where you meet",
		setupPlaceHint:
			"Usually your home address. Only the person you hand a book to sees it, and only once you both agree a time.",
		setupTimesTitle: "When you can meet",
		setupTimesHint:
			"Tick the times that usually suit you. Arranging a handoff then takes a tap.",
		setupBookTitle: "Your first book",
		startContinue: "Let's start",
		editBook: "Correct this book's details",
		editBookHint:
			"Moderators only. This changes the book for everyone who has a copy of it.",
		statsTitle: "Figures",
		statsPrivate: "Only you see these.",
		statAdded: "Listed",
		statLoans: "Times lent",
		statReaders: "Different readers",
		statDaysOut: "Days away",
		statLastLoan: "Last lent",
		statNever: "not yet",
		statBooks: "Books listed",
		statBorrowed: "Books borrowed",
		statOutNow: "Out right now",
		statMemberSince: "Member since",
		manageCopy: "Manage this copy",
		inviteTitle: "Invite a neighbour",
		inviteWhy:
			"The library is invitation only. Send a link to someone you know; they join with their email, no password.",
		inviteLinkCreate: "Make an invite link",
		inviteAnother: "Make another link",
		inviteCreating: "Making it\u2026",
		inviteShownOnce:
			"Send this now \u2014 it is shown once and we do not keep a copy.",
		inviteFailed: "Could not make a link. Try again.",
		inviteTooMany:
			"You have five invites out already. Wait for one to be used, or withdraw one.",
		inviteWithdraw: "Withdraw",
		inviteJoined: "Joined:",
		sameBookAsk:
			"Somebody already has a book that looks like this one. Is it the same book?",
		sameBookYes: "Yes, same book",
		sameBookNo: "No, mine is different",
		booksMerged: "Filed as one book.",
		booksKeptApart: "Kept as two books.",
		possibleDuplicates: "Possible duplicates",
		noDuplicates: "Nothing looks duplicated.",
		duplicatesHint:
			"Two members listing the same book by hand rarely spell it the same way. Merging keeps the title you choose and moves the copies, tags and waiting members across.",
		differentBooks: "Different books",
		notifications: "Notifications",
		pushEnable: "Turn on for this device",
		pushNudge:
			"Notifications are off on this device. Turn them on to hear at once when a neighbour asks or answers.",
		pushDisable: "Turn off for this device",
		pushOn: "On for this device",
		pushTest: "Send a test",
		pushTestSent: "Sent. It should appear in a few seconds.",
		pushTestFailed:
			"This device did not take it. Turn notifications off and on again.",
		pushTestLimit: "Five tests an hour is the limit.",
		pushOff: "Off for this device",
		pushBlocked:
			"This browser is blocking notifications. Allow them in its site settings to turn them on.",
		pushUnsupported:
			"This browser cannot show notifications. On an iPhone, add the library to your home screen first.",
		pushHint:
			"We email you instead if you have not looked within a few minutes.",
		tagSuggested: "Suggestion sent to the moderators.",
		tagSuggestFailed: "Could not send that suggestion.",
		suggestTag: "Missing a tag? Suggest one",
		suggestTagHint:
			"Write it in your own words. A moderator turns it into a tag in both languages, and it appears on this book once they do.",
		suggestTagLabel: "Under which label",
		suggestTagValue: "The tag",
		suggestNewLabel: "A new label…",
		suggestNewLabelName: "Name for the new label (if none of the above fit)",
		suggestSend: "Send suggestion",
		tagProposals: "Tag suggestions",
		noProposals: "No suggestions waiting.",
		approveTag: "Approve",
		declineTag: "Decline",
		tagSlug: "Slug (a-z, dashes)",
		tagLabelEn: "English label",
		tagLabelHe: "Hebrew label",
		newLabelSlug: "New label slug",
		suggestedBy: "suggested by",
		forBook: "on",
		tagApproved: "Added to the vocabulary:",
		declineNote: "A word back",
		vocabularyTitle: "The vocabulary",
		tagAdd: "Add a tag",
		tagGroup: "Group",
		tagNewGroup: "A new group",
		tagNewGroupHint:
			"Only for a new group: a slug, and its name in both languages.",
		tagAddButton: "Add tag",
		renameGroup: "Rename this group",
		tagRemove: "Remove this tag",
		tagRemoveHint: "It comes off every book that carries it.",
		tagBuiltin: "Built in: the library tags new books with it, so it stays.",
		tagAdded: "Added:",
		tagSaved: "Saved.",
		tagRemoved: "Removed, and taken off every book that had it.",
		tagExists: "That tag is already in the vocabulary.",
		settledProposals: "Already decided",
		sections: "Sections",
		add: "Add",
		filters: "Filters",
		clearFilters: "Clear filters",
		loadingMore: "Loading…",
		tagsLegend: "Tags (they describe the book, so every copy shares them)",
		tagsSaved: "Tags saved.",
		editTags: "Edit tags",
		// Heading over an owner's tools on a book's page; a moderator's is "admin".
		extrasTags: "Tags",
		lendLimit: "Books out at once, at most",
		lendLimitAny: "no limit",
		lendLimitHint:
			"While you are at your limit your books stay in the catalogue, marked as fully lent out, and nobody can request another.",
		awayUntil: "Away until",
		awayBadge: "owner away",
		awayHint:
			"Going away? Give the day you are back. Your books stay in the catalogue, marked as away, and nobody can ask for them until then.",
		awayNowHint:
			"You are away. Your books cannot be asked for until the day above; clear the date to come back sooner.",
		search: "Search",
		searchPlaceholder: "Title or author",
		shelf: "My shelf",
		addCopy: "Add a book",
		isbn: "ISBN",
		mainNav: "Main",
		accountNav: "Account",
		title: "Title",
		authors: "Authors",
		condition: "Condition",
		lendable: "Available to lend",
		relay: "May pass straight to the next reader",
		note: "Note",
		cover: "Cover photo",
		coverChoose: "Choose a photo",
		coverChange: "Choose a different photo",
		coverRemove: "Remove photo",
		coverZoom: "Zoom",
		coverHint:
			"Drag the cover, or move it with the arrow keys, to place it inside the frame.",
		save: "Save",
		noResults: "Nothing found nearby.",
		notFound: "That page is not on any shelf",
		notFoundHint:
			"The link may be old, or the book may have been taken off the shelves. Nothing is lost: the rest of the library is where you left it.",
		notFoundInstead: "While you are here",
		contactTitle: "Write to the library",
		contactLede:
			"Feedback, a question about your data, or a complaint. It reaches the library's admin, not the moderators, so a complaint about one is safe to send.",
		contactTopic: "What is this about",
		contactFeedback: "Feedback or an idea",
		contactData: "My data: a copy, a correction, or deletion",
		contactComplaint: "A complaint",
		contactBody: "What would you like to say?",
		contactSend: "Send",
		contactSent: "Sent. You will get an answer at the address above.",
		contactFailed: "That did not send. Try again in a moment.",
		contactTooMany:
			"Five messages in an hour is the limit. What you wrote is not lost, so try again shortly.",
		contactRights:
			"A data request is answered within a month. You can also write straight to",
		emptyShelf: "No books listed yet.",
		titlePlaceholder: "e.g. A Tale of Love and Darkness",
		authorsPlaceholder: "e.g. Amos Oz (several? separate with commas)",
		notePlaceholder: "e.g. Signed, a little worn on the spine",
		addThing: "Add a thing",
		tabAdd: "Add",
		thingName: "What is it",
		thingNamePlaceholder: "e.g. Cordless drill",
		quantity: "How many",
		quantityHint:
			"For a set, like 12 folding chairs: neighbours can borrow some of them.",
		photo: "Photo",
		photoHint:
			"Drag the photo, or move it with the arrow keys, to place it inside the frame.",
		categoryLegend: "Category",
		thingDetails: "More details",
		brand: "Brand",
		brandPlaceholder: "e.g. Bosch",
		model: "Model",
		modelPlaceholder: "e.g. PSR 18",
		included: "What comes with it",
		includedPlaceholder: "e.g. Carry case, two batteries, charger",
		needs: "What the borrower brings",
		needsPlaceholder: "e.g. Drill bits, a gas canister",
		care: "How to look after it",
		carePlaceholder: "e.g. Dry it before packing it away",
		thingNotePlaceholder: "e.g. The left hinge is a little stiff",
		photos: "Photos (up to four)",
		photosAdd: "Add photos",
		photosRemove: "Remove",
		photosHint:
			"Drag a photo, or use the arrow keys, to place it in its square. Zoom out to show it whole.",
		photosMain: "Main photo",
		photosKeep: "Keep",
		photosEarlier: "Move earlier",
		photosLater: "Move later",
		photosNew: "New",
		photosRoomNone: "No room for more photos.",
		photosRoomOne: "One more photo fits.",
		photosRoomMany: "Up to {n} more.",
		productLink: "Product page",
		productLinkPlaceholder: "https://…",
		productLinkHint:
			"Where to read about it on another website: the maker's page or a shop's, for the manual and specifications.",
		productPage: "Product page",
		thingSafety:
			"Tools and gear can injure people. Lend only what is safe to use, and say in the details what a borrower should know: how to use it, what it needs, any fault.",
		isbnPlaceholder: "13 digits, on the back cover",
		scanHint:
			"Title and author are enough. If the book has an ISBN, add it at the end: it often brings the cover with it.",
		signIn: "Sign in",
		email: "Email",
		sendLink: "Send me a sign-in link",
		linkSentTitle: "Check your email",
		linkSent:
			"If the address belongs to a member, a sign-in email is on its way. Use it within 15 minutes, either way:",
		linkSentTapLink:
			"Tap the link in the email. You are signed in wherever it opens.",
		linkSentTypeCode:
			"Or, if it opens in another browser or app than this one, type the email's eight-digit code here.",
		linkFailed: "That link did not work. Ask for a new one.",
		signInCodeLabel: "Code from the email",
		signInCodeSubmit: "Sign in with the code",
		sendNewLink: "Send a new link, or to another address",
		signInCodeFailed:
			"That code did not work. Check the newest email, or ask for a new link.",
		finishSignIn: "One tap to finish signing in on this device.",
		join: "Join the library",
		joinHint: "You were invited. Enter your email to get a sign-in link.",
		inviteUsedUp:
			"This invite has already been used. Ask whoever sent it for a new one.",
		inviteExpired:
			"This invite has expired. Ask whoever sent it for a new one.",
		alreadyMember: "Already a member?",
		welcome: "Welcome",
		welcomeHint:
			"A name your neighbours know you by, and roughly where you are. Don't need the exact address.",
		displayName: "Name",
		areaLabel: "Neighbourhood",
		locate: "Use my location",
		mapMore: "Not on the list? Place yourself on the map",
		located: "Got it — stored roughly, not exactly.",
		locateFailed: "Could not get a location. Type your neighbourhood instead.",
		language: "Language",
		editEditionsFirst:
			"This book has more than one edition, so its cover cannot be replaced here. Merge them first.",
		workNote: "About this book",
		workNoteHint:
			"A few words everyone sees: the edition, a series, a translation, the year.",
		workNoteFromCopy:
			"Filled in from the note one owner wrote. Keep what describes the book itself before saving.",
		profile: "My account",
		areaRequired:
			"Set your area first — distances on the shelves depend on it.",
		areaMissing: "Pick a spot on the map or use your location.",
		areaLabelHint: "e.g. Church End",
		extend: "Extend by a week",
		extendForThem: "Give them another week",
		extended: "Due date pushed back a week.",
		extendWaiting:
			"Someone is waiting for this book, so only the owner can extend it.",
		reportProblem: "Report a problem",
		reportKind: "What happened",
		reportBody: "Details",
		reportHint:
			"Goes to the moderators only. Nothing is decided automatically; a lost book takes the copy off the shelves.",
		reportSend: "Send report",
		reportAbout: "about",
		readThread: "Read the conversation",
		noReportThread: "That report has no conversation to read.",
		moderationNote:
			"You are reading a private conversation because it was reported. Read what you need to settle it, and nothing else. You can write to the member who reported it under their report; the other side never sees that.",
		resolve: "Resolved",
		dismiss: "Dismiss",
		bookTurnedUp: "Book turned up",
		borrow: "Borrow",
		requestRelay: "Ask to be next",
		waitlistJoin: "Tell me when a copy is free",
		waitlistJoined:
			"You are on the list. You get first dibs when a copy frees up.",
		waitlistLeave: "Leave the list",
		waitlistHint: "No copy can be requested right now.",
		waitlistTitle: "Waiting for",
		waitlistEmpty: "You are not waiting for anything.",
		showPastLoans: "Show returned and cancelled",
		hidePastLoans: "Hide returned and cancelled",
		relaying: "Passing on",
		relayingHint:
			"Books you hold that go straight to the next reader. Arrange the handoff on each loan.",
		availabilityTitle: "When you can meet",
		profilePrefs: "Lending and language",
		availabilityHint:
			"Tick the times you can usually hand a book over. Slots you share with the other person are offered first.",
		meetingPlace: "Where you meet (private)",
		meetingPlaceHint:
			"e.g. 12 Church Road, ring the top bell — or the café on the corner",
		meetingNote: "A note for whoever comes (private)",
		meetingNoteHint:
			"e.g. Please knock, don't ring — the baby sleeps. Or: it's in the box by the door.",
		meetingPlacePrivacy:
			"Shown only to the person you are handing a book to, and only after a time is agreed.",
		handoffOut: "Handing it over",
		handoffBack: "Handing it back",
		addToCalendar: "Add to calendar:",
		otherCalendars: "Apple, Outlook and others",
		pickSlot: "Pick a time that suits you:",
		theirGridEmpty:
			"The other person has not filled in their times yet — propose one of yours.",
		noSlots: "Neither of you has set times yet.",
		bothFree: "both free",
		oneFree: "one of you is free",
		slotPending: "proposed, awaiting an answer",
		proposeTime: "Propose this time",
		proposeAnother: "Propose a different time",
		youProposed: "You proposed",
		theyProposed: "They proposed",
		confirmTime: "Confirm",
		withdraw: "Withdraw",
		suggestAnother: "Suggest another",
		changeTime: "Change the time",
		meetAt: "Where:",
		placeMissingHost:
			"You have not said where you meet. The other person sees it once a time is agreed.",
		setPlace: "Set where you meet",
		yourCode: "Your handoff code:",
		codeHint: "Read it out when you meet; the borrower types it in to confirm.",
		enterCode: "Code from the lender",
		confirmHandoff: "Confirm handoff",
		wrongCode: "That code is not right. Ask the lender to read it again.",
		timeAgreed: "Time agreed.",
		handoffDone: "Handoff confirmed.",
		editAvailability: "Edit your times",
		needsTime: "Pick a time",
		needsTimeHint:
			"Accepted a day ago and no time yet. Pick one below so the book can change hands.",
		setAvailability: "Set your times",
		availabilityNudge:
			"You have not said when you can meet yet. Fill in your times and a handoff is easy to arrange.",
		fallbackHanded: "Met without the code? Use “Mark as handed over” below.",
		connectTitle: "Connect an assistant",
		connectIntro:
			"Claude, ChatGPT, Claude Code and other MCP clients can use the library on your behalf. The server address:",
		connectCan: "What an assistant can do for you",
		connectCannot: "What it cannot do",
		connectManage:
			"Every connection is listed on your profile, where you can disconnect it.",
		connect: "Connect an assistant",
		notIsbn:
			"That barcode is not an ISBN (ISBNs start with 978 or 979). Danacode and other codes have no catalogue record — fill in the title and author, and add a cover photo.",
		consentTitle: "Connect an app",
		consentAsks: "wants access to the library as",
		consentReturnsTo: "If you approve, you go back to",
		consentHint:
			"Only looking is ticked. Tick the rest only if you want it to act for you — sending messages, asking for books. You can disconnect it any time from your profile. It can never see other members' addresses or emails.",
		consentApprove: "Allow",
		consentDeny: "Cancel",
		consentBad:
			"That connection request is incomplete. Start again from the app.",
		connectedApps: "Connected apps",
		addFailed: "Could not save. Try again.",
		wantedTitle: "Can't find it? Ask for it",
		wantedHint:
			"We put you on its waitlist. The first copy anyone lists is held for you for 48 hours.",
		wantedAuthors: "Author",
		wantedAsk: "Ask for this book",
		wantedFailed: "Could not record the request.",
		lookingFor: "Neighbours are looking for",
		haveIt: "Have it? Add your copy",
		share: "Share",
		copyLink: "Copy link",
		copy: "Copy",
		copied: "Copied",
		linkCopied: "Link copied",
		ogTagline: "neighbourhood library",
		teaserSignIn: "Sign in to see who has it near you and ask for it.",
		teaserJoin:
			"Not a member yet? Ask whoever sent you this for an invite link.",
		apiTitle: "REST API",
		webhooksTitle: "Webhooks",
		webhooksIntro:
			"Get a signed POST when something happens: a copy listed, a loan accepted, a handoff confirmed. Delivered at least once, retried for a day, then dropped.",
		webhookUrl: "URL (https)",
		webhookKinds: "Which events",
		webhookAllHint: "Leave all unticked to receive everything.",
		webhookCreate: "Subscribe",
		webhookSecretOnce:
			"Your signing secret. Copy it now; it will not be shown again.",
		webhookFailed: "Could not subscribe. Check the URL.",
		webhookDone: "Done",
		webhookAll: "all events",
		webhookTest: "Send a ping",
		webhookRemove: "Remove",
		webhookPingOk: "Ping delivered.",
		webhookRemoved: "Webhook removed.",
		webhookDisabled:
			"switched off after repeated failures; a successful ping switches it back on",
		apiIntro:
			"Anything the site does, a script can do. Same routes, same permissions, JSON in and out.",
		apiSpec: "OpenAPI document",
		tokenTitle: "Personal token",
		tokenIntro:
			"For your own scripts. Choose what it may do; it is shown once and expires in a year.",
		tokenName: "Name (what is this token for?)",
		tokenCreate: "Create token",
		tokenShownOnce: "Copy it now; it will not be shown again.",
		tokenCopy: "Copy",
		tokenCopied: "Copied",
		tokenFailed: "Could not create the token.",
		tokenSignIn: "Sign in to create a token.",
		noApps: "No apps connected.",
		appRevoked: "Disconnected.",
		disconnect: "Disconnect",
		terms: "Terms",
		privacy: "Privacy",
		privacyVersion: "Version 1 \u2014 September 2026.",
		termsVersion: "Version 1 — September 2026.",
		termsHint:
			"By signing in you confirm you are 18 or over and agree to the terms.",
		attention: "Needs a moderator",
		attentionNone: "Nothing needs you right now.",
		attentionHint:
			"Loans more than 14 days overdue and requests unanswered for 2 days show up here.",
		lookingUp: "Looking it up…",
		isbnNotFound:
			"No record for that ISBN. Fill in the title and author below and it will still be listed.",
		isbnFound: "Found",
		yours: "yours",
		markHanded: "Mark as handed over",
		markReturned: "Mark as returned",
		nudge: "Nudge",
		nudgeSent: "Nudge sent.",
		nudgedRecently: "Nudged today — once a day is enough.",
		nothingYetHint: "Be the first: add a book from your shelf.",
		emptyShelfHint: "Type a title and author — it takes a minute.",
		manage: "Manage",
		browse: "Browse",
		tabOverview: "Overview",
		assets: "Books",
		overviewHint:
			"Numbers link to their lists. Stale loans and reports appear here once handoffs exist.",
		inviteHint:
			"Post the link in the group. Each link stops working after its uses or its days run out.",
		assetSearch: "Title, author, or owner",
		noAssets: "No books match.",
		colOwner: "Owner",
		colLoan: "Loan",
		colAdded: "Added",
		retire: "Retire",
		assetRetired:
			"Retired. It is gone from the catalogue; the owner keeps their record.",
		noRequestsHint: "Find something on the shelves and ask for it.",
		messages: "Messages",
		noSuchLoan: "No such loan.",
		noMessages: "No messages yet. Say when and where suits you.",
		// Once the time is agreed there is nothing left to settle in words.
		noMessagesAgreed: "No messages yet. Write here if anything changes.",
		acceptedMeetingSet: "accepted — meeting set",
		writeMessage: "Write a message",
		send: "Send",
		theModerators: "The moderators",
		allMembers: "Show all members",
		adminMessages: "Messages",
		logTab: "Log",
		statActiveLoans: "active loans",
		adminLoansOpen: "Open",
		adminLoansAll: "All",
		adminLoansNone: "No loans here.",
		adminLoansBook: "Book",
		adminLoansLender: "Lender",
		adminLoansBorrower: "Borrower",
		adminLoansSince: "Since",
		adminLoansDue: "Due",
		adminLoansOverdue: "overdue",
		theirData: "Their data",
		theirDataHint:
			"For a data request: a copy of everything the library holds about them, or forgetting them. Both are logged.",
		exportData: "Download their data",
		eraseMember: "Delete this member",
		eraseHint:
			"Their address, name, area, meeting place, messages, devices and connected apps go, and their books come off the shelves. Past loans stay, with no name on their side. This cannot be undone. Not possible while they have an open loan, or while they are an admin.",
		eraseButton: "Delete for good",
		eraseBlocked:
			"They still have an open loan, or are an admin. Settle the loan or change their role first.",
		memberErased: "The member was deleted.",
		dataRequestsOpen: "Data requests waiting",
		openInvitesTitle: "Their open invite links",
		noOpenInvites: "None open.",
		revokeTheirInvites: "Revoke all their invite links",
		logHint:
			"Every change made through moderation, and by whom. Only the admin sees this.",
		logNone: "Nothing has been changed yet.",
		logWhen: "When",
		logWho: "Who",
		logWhat: "What",
		logDetails: "Details",
		settingsTab: "Settings",
		myTagging: "Tag my books",
		myTaggingHint:
			"Tick what fits. A value that is missing, typed into its group, goes to the moderators as a suggestion and appears on the book once they approve. Enter saves.",
		myTaggingLink: "Tag my books quickly",
		settingsSaved: "Saved.",
		formSaving: "Saving…",
		formSaved: "Saved.",
		settingsName: "The library's name",
		settingsWords: "How the library introduces itself",
		settingsWordsHint:
			"Shown on the front page, in link previews and on the about page, in each language the library offers. Leave a field empty to show nothing there.",
		settingsTextName: "Name in this language",
		settingsTextNameHint: "Empty: the name above.",
		settingsShortName: "Short name",
		settingsShortNameHint:
			"A word or two for where space is short: the header on a phone and the label under the home-screen icon. Empty: “Library”.",
		settingsTagline: "One line under the name",
		settingsAbout: "Who the library is for",
		settingsLanguage: "Default language",
		settingsCentre: "Where the library is",
		settingsCentreHint:
			"A neighbourhood, a street or a postcode near the middle. Places members type are looked up near here, and distances measured from here.",
		settingsCentreMark: "The library",
		settingsCentreMap: "Not on the list? Place it on the map",
		settingsRadius: "How far it reaches",
		settingsRadiusHint:
			"Roughly how far from the middle its members live. Where everyone lives close by, no distances are shown, but this still keeps place suggestions near.",
		settingsLanguages: "Languages the library offers",
		settingsLanguagesBoth: "English and Hebrew",
		settingsLanguagesEn: "English only",
		settingsLanguagesHe: "Hebrew only",
		settingsLanguagesHint:
			"With one language there is no language switch, and every page is in it. The default language has to be one of these.",
		settingsAccent: "The library's colour",
		settingsAccentHint:
			"Buttons, links and the library's name take this colour. Where it would be hard to read, it is made darker or lighter, in light and dark mode alike.",
		settingsAccentHouse: "the house green",
		settingsAccentOwn: "Your own colour",
		settingsSize: "How far apart members live",
		settingsSizeWide: "Spread over an area: ask where each member lives",
		settingsSizeCompact: "All close by: no areas, no map",
		settingsSizeHint:
			"In a library spread over a neighbourhood or a town, members give a rough area, and books show how far away they are. Where everyone lives a few minutes apart (a building, a street, a congregation), that tells nobody anything: the area, the map and distances are left out.",
		setupNameTitle: "Your name",
		setupNameHint: "How your neighbours will know you.",
		settingsLanguageHint:
			"What the site opens in for someone who has not chosen a language. Anyone can switch from the menu, and a link can carry ?lang=he or ?lang=en.",
		settingsLoanDays:
			"How long a loan lasts, in days (unless the owner says otherwise)",
		settingsInvitesOpen: "Invite links a member may have open at once",
		settingsInvitesOpenHint: "0 leaves inviting to the moderators.",
		settingsInviteDays: "How many days a member's invite link stays good",
		onlyAdmin:
			"You are the library's only admin. If you are away, nobody can do what only an admin can.",
		onlyAdminLink: "Make a second admin",
		adminsOnly: "This page is for the library's admin.",
		adminMessagesHint:
			'Everything written through "Write to the library", newest first. Moderators do not see these.',
		adminMessagesNone: "No messages yet.",
		adminMessagesVisitor: "A visitor",
		adminMessagesMark: "Mark as handled",
		adminMessagesReopen: "Open again",
		newer: "Newer",
		older: "Older",
		tagging: "Tagging",
		taggingWhich: "Books",
		taggingUntagged: "Need tags",
		taggingAll: "All",
		taggingDone: "Every book has its tags. Nothing left to tag.",
		taggingNone: "No books yet.",
		taggingSaveNext: "Save and next",
		taggingBack: "Back",
		taggingSkip: "Skip",
		taggingHint:
			"Tick what fits. A new value typed into a group becomes a tag here; its other language can be set on the Tags page. Enter saves.",
		noSuchMember: "No such member in this community.",
		memberJoined: "Joined",
		memberLoans: "Loans",
		changeRoleOrStatus: "Change role or status",
		cameInHow: "How they came in",
		invitedByLabel: "Invited by",
		noInviter:
			"No invitation on record: they were here from the start, or joined before invitations were kept.",
		inviteTrail: "The trail of invitations",
		inviteTrailHint:
			"Each person was invited by the one below them, back to whoever started the chain.",
		theyInvited: "People they invited",
		invitedNobody: "Nobody yet.",
		reportsTheyFiled: "Reports they filed",
		reportsAboutThem: "Reports about them",
		noReportsFiled: "None.",
		noReportsAbout: "None.",
		writeToModerators: "Write to the moderators",
		settleCancelled: "Call it off",
		settleReturned: "The book came back",
		settleLost: "The book is lost",
		settleLostConfirm:
			"Mark the book lost? It comes off the shelves until somebody puts it back.",
		settleLostYes: "Yes, it is lost",
		settleHint:
			"Nobody can message or nudge a suspended member. Close the loan once you know where the book is.",
		loanSettled: "The loan is closed.",
		threadClosed: "This loan is closed; the conversation is read-only.",
		viewBookPage: "See the book page",
		saved: "Saved.",
		copyLocked: "This copy has a loan in progress. Settle it first.",
		copyLockedHint:
			"A loan is in progress; lending and removal wait until it is settled.",
		editionShared:
			"Other members list this edition, so its title and authors are shared.",
		editionSharedHint:
			"Title and authors come from the shared edition and cannot be edited here.",
		coverFailed: "The cover could not be saved. Try a smaller image.",
		lendingPolicy: "Lending",
		lendingLendable: "Available to lend",
		lendingPaused: "Paused — keep it listed, do not lend for now",
		lendingReference: "Reference only — show it, never lend it",
		loanDays: "Loan length (days)",
		loanDaysDefault: "community default",
		replaceCover: "Replace the cover",
		removeHeading: "Remove",
		removeFromShelf: "Remove this book from my shelf",
		removeConfirm:
			"Remove it? It disappears from the catalogue. Past loans are kept.",
		removeYes: "Yes, remove",
		removeNo: "Keep it",
		removed: "Removed from your shelf.",
		mapHint:
			"Tap roughly where you live. It is kept to about 300 m, never your address.",
		signOut: "Sign out",
		landingInvite:
			"A neighbour who is already a member sends you a link to join. Already a member? Sign in with your email.",
		landingInviteTitle: "By invitation",
		landingLend: "Lend",
		landingBorrow: "Borrow",
		landingReturn: "Return",
		aboutLibrary: "How it works",
		landingInviteShort:
			"A neighbour who is already a member sends you a link to join.",
		guestShelves: "On the shelves",
		membersOnlyTitle: "Only members can borrow",
		membersOnlyBody:
			"This library is by invitation. Any neighbour who is already a member can send you an invite, so ask someone you know here.",
		membersOnlySignIn: "I'm a member: sign in",
		keepLooking: "Keep looking",
		linkNeedsInvite:
			"Nothing arriving? You may need an invitation from a member first.",
		admin: "Moderation",
		skipToContent: "Skip to the page",
		viewAsMember: "See it as a member",
		viewingAsMember: "You are seeing the library as a member.",
		viewAsModerator: "Back to the moderator's view",
		moderatorsOnly: "This page is for moderators.",
		adminActionFailed: "That did not work. Try again.",
		statMembers: "members",
		statModerators: "moderators",
		statCopies: "copies",
		statLendable: "lendable now",
		statInvites: "live invites",
		invites: "Invites",
		inviteCreated: "Your invite link. Copy it now: it is not shown again.",
		inviteUses: "Uses",
		inviteDays: "Days valid",
		inviteCreate: "Create invite",
		inviteByEmail: "Invite by email",
		inviteByEmailHint:
			"They get one link that joins and signs them in. Nothing to pass on.",
		inviteEmailSend: "Send invitation",
		inviteEmailSent: "Invitation sent.",
		inviteAlreadyMember: "That address is already a member.",
		inviteEmailRate:
			"Thirty invitations a day is the limit. Try again tomorrow.",
		inviteLinkTitle: "Invite link",
		colSentTo: "Sent to",
		inviteLive: "live",
		inviteSpent: "used up / expired",
		inviteRevoked: "revoked",
		revoke: "Revoke",
		members: "Members",
		navPeople: "People",
		navBooks: "Books",
		navLibrary: "Library",
		colCreatedBy: "Created by",
		colUses: "Uses",
		colExpires: "Expires",
		colStatus: "Status",
		colName: "Name",
		colEmail: "Email",
		colArea: "Area",
		colRole: "Role",
		colCopies: "Copies",
		colLastSeen: "Last seen",
		colMeeting: "Ready to meet",
		meetingPlaceSet: "Place",
		availabilitySet: "Times",
		notSetYet: "not set yet",
		roleModerator: "moderator",
		roleAdmin: "admin",
		roleMember: "member",
		promote: "Make moderator",
		demote: "Remove moderator",
		makeAdmin: "Make admin",
		removeAdmin: "Remove admin",
		demoteSelfConfirm:
			"Remove your own moderator role? You will lose this page until another moderator restores it.",
		demoteSelfYes: "Yes, remove my role",
		suspend: "Suspend",
		reinstate: "Reinstate",
		onTheShelves: "On the shelves near you",
		allBooks: "All books",
		filterAvailable: "Available now",
		filterShow: "Show",
		filterShowMine: "Show mine",
		filterShowRead: "Show ones I've read",
		markRead: "I've read it",
		wishlist: "Want to read",
		wishlistTab: "To read",
		contactShort: "Contact",
		profileQuick: "Your account",
		deviceTitle: "Sign in on another device",
		deviceHint:
			"A link that signs you in on your phone or another computer, without waiting for an email. It works once, for ten minutes. Anyone who has it can sign in as you, so open it only on your own device.",
		deviceCreate: "Create a link",
		deviceAgain: "Create a new link",
		deviceCreating: "Creating…",
		deviceFailed: "Could not create a link. Try again.",
		deviceTooMany: "Five links an hour is the limit. Try again later.",
		deviceScan: "Scan this with the other device's camera:",
		deviceOrCopy: "Or copy the link and open it there:",
		deviceQrAlt: "QR code of the sign-in link",
		deviceUntil: "Works once, until {time}.",
		wishlistEmpty: "Nothing kept here yet.",
		emptyBrowse: "Browse the library",
		wishlistEmptyHint:
			"Tap “Want to read” on a book to keep it here. You'll hear when a copy near you is free.",
		wishlistHint: "You'll hear when one of these is free near you.",
		wishlistWithoutCopies: "Nobody here has these right now",
		sortBy: "Sort",
		sortNew: "New",
		sortTitle: "A\u2013Z",
		sortDistance: "Nearest",
		filterDistance: "Distance",
		anyDistance: "Any",
		nothingYet: "Nothing to borrow yet. Add a book to get things moving.",
		more: "More",
		noSuchBook: "No such book.",
		copiesNearby: "Copies nearby",
		noCopies: "Nobody nearby has a lendable copy right now.",
		you: "You",
		request: "Request",
		requestNote: "A note for the owner",
		requiredKey: "Required",
		requestSent:
			"Request made. The owner hears about it in five minutes; until then you can cancel it under Loans.",
		requestTaken: "Someone else has an open request on this copy.",
		requestFailed: "That did not work. Try again.",
		requestAway: "Its owner is away. Ask again once they are back.",
		requestLimit:
			"Its owner is lending as many as they can at once. Ask again when one comes back.",
		requestHold: "It is held for someone on the waitlist for now.",
		requestCount: "Not that many are free any more.",
		requestAsked: "You already have some of this set.",
		requestUnavailable: "This cannot be asked for right now.",
		bookEdited: "Corrected.",
		mergeFailed:
			"Those could not be filed as one: they may be different books, or not yours alone. A moderator can.",
		inviteWithdrawn: "Invitation withdrawn.",
		youRequested: "You have requested this copy.",
		youAgreed: "Agreed: arrange when to collect.",
		yourLoan: "Your loan",
		loans: "Loans",
		incoming: "Requests for my books",
		noIncoming: "Nobody is asking for your books right now.",
		myRequests: "My requests",
		noRequests: "You have no open requests.",
		accept: "Accept",
		decline: "Decline",
		cancel: "Cancel",
		loanActionFailed: "That did not work. Try again.",
	},
	he: {
		appShort: "ספרייה",
		about: "על הספרייה",
		menu: "תפריט",
		installApp: "הוספה למסך הבית",
		installIos: "בספארי: כפתור השיתוף למטה, ואז \u201cהוספה למסך הבית\u201d.",
		checkJunk:
			"אם הוא לא הגיע תוך דקה, חפשו בתיקיית הספאם. הראשון נוחת שם לא פעם.",
		saveContact: "שמירת הספרייה באנשי הקשר",
		saveContactWhy: "כדי שהבא כבר לא ינחת שם.",
		cookieNote:
			"אנחנו שומרים אצלכם מעט — מה שמחבר אתכם, והעדפות קטנות כמו השפה שבה אתם קוראים. בלי מעקב, בלי אנליטיקס, בלי פרסום, ושום דבר עליכם לא נמכר ולא מועבר הלאה.",
		firstBook: "הוסיפו ספר אחד שאתם שמחים להשאיל.",
		startLede: "שכנים משאילים זה לזה ספרים שכבר יש להם.",
		startSetupTitle: "שלושה צעדים קצרים להתחלה",
		startAssistantShort: "ערימת ספרים? עוזר יכול לרשום אותה בשבילכם.",
		setupNext: "הבא",
		setupLater: "אחר כך",
		setupAreaTitle: "השם והאזור שלכם",
		setupAreaHint:
			"בערך איפה אתם גרים, כדי שהשכנים יראו כמה רחוק הספר. לא הכתובת.",
		setupPlaceTitle: "איפה נפגשים",
		setupPlaceHint:
			"בדרך כלל כתובת הבית. רק מי שמקבלים מכם ספר רואים אותה, ורק אחרי שקבעתם מועד.",
		setupTimesTitle: "מתי אפשר להיפגש",
		setupTimesHint:
			"סמנו את הזמנים שבדרך כלל נוחים לכם, ותיאום מסירה יהיה בלחיצה.",
		setupBookTitle: "הספר הראשון",
		startContinue: "בואו נתחיל",
		editBook: "תיקון פרטי הספר",
		editBookHint: "למודרטורים בלבד. השינוי משפיע על כל מי שיש לו עותק.",
		statsTitle: "מספרים",
		statsPrivate: "רק אתם רואים את אלה.",
		statAdded: "נרשם",
		statLoans: "הושאל",
		statReaders: "קוראים שונים",
		statDaysOut: "ימים בחוץ",
		statLastLoan: "הושאל לאחרונה",
		statNever: "עוד לא",
		statBooks: "ספרים רשומים",
		statBorrowed: "ספרים ששאלתם",
		statOutNow: "בחוץ כרגע",
		statMemberSince: "חברים מאז",
		manageCopy: "ניהול העותק",
		inviteTitle: "הזמנת שכן/ה",
		inviteWhy:
			"הכניסה לספרייה בהזמנה. שלחו קישור למישהו שאתם מכירים; ההצטרפות באימייל, בלי סיסמה.",
		inviteLinkCreate: "יצירת קישור הזמנה",
		inviteAnother: "יצירת קישור נוסף",
		inviteCreating: "רגע\u2026",
		inviteShownOnce:
			"שלחו עכשיו \u2014 הקישור מוצג פעם אחת ואיננו שומרים עותק.",
		inviteFailed: "לא הצלחנו ליצור קישור. נסו שוב.",
		inviteTooMany:
			"יש לכם כבר חמש הזמנות פתוחות. חכו שמישהי תשתמש באחת, או בטלו אחת.",
		inviteWithdraw: "ביטול",
		inviteJoined: "הצטרפו:",
		sameBookAsk: "למישהו כבר יש ספר שנראה כמו זה. אותו ספר?",
		sameBookYes: "כן, אותו ספר",
		sameBookNo: "לא, שלי אחר",
		booksMerged: "אוחדו לספר אחד.",
		booksKeptApart: "נשארו שני ספרים.",
		possibleDuplicates: "כפילויות אפשריות",
		noDuplicates: "לא נראה שיש כפילויות.",
		duplicatesHint:
			"שני חברים שרושמים את אותו ספר ביד כמעט אף פעם לא כותבים אותו אותו דבר. איחוד שומר את הכותרת שתבחרו ומעביר אליה את העותקים, התגיות והממתינים.",
		differentBooks: "ספרים שונים",
		notifications: "התראות",
		pushEnable: "הפעלה במכשיר הזה",
		pushNudge:
			"ההתראות כבויות במכשיר הזה. הפעילו אותן כדי לדעת מיד כששכן מבקש או עונה.",
		pushDisable: "כיבוי במכשיר הזה",
		pushOn: "פעיל במכשיר הזה",
		pushTest: "שליחת בדיקה",
		pushTestSent: "נשלח. ההתראה אמורה להופיע תוך כמה שניות.",
		pushTestFailed: "המכשיר לא קיבל אותה. כבו את ההתראות והפעילו מחדש.",
		pushTestLimit: "אפשר לשלוח עד חמש בדיקות בשעה.",
		pushOff: "כבוי במכשיר הזה",
		pushBlocked: "הדפדפן חוסם התראות. אפשרו אותן בהגדרות האתר כדי להפעיל.",
		pushUnsupported:
			"הדפדפן הזה לא מציג התראות. באייפון — הוסיפו קודם את הספרייה למסך הבית.",
		pushHint: "אם לא תסתכלו תוך כמה דקות, נשלח לכם מייל במקום.",
		tagSuggested: "ההצעה נשלחה למודרטורים.",
		tagSuggestFailed: "לא הצלחנו לשלוח את ההצעה.",
		suggestTag: "חסרה תגית? הציעו אחת",
		suggestTagHint:
			"כתבו במילים שלכם. ספרן/ית יהפכו את זה לתגית בשתי השפות, ואז היא תופיע על הספר הזה.",
		suggestTagLabel: "תחת איזו קטגוריה",
		suggestTagValue: "התגית",
		suggestNewLabel: "קטגוריה חדשה…",
		suggestNewLabelName: "שם לקטגוריה החדשה (אם אף אחת לא מתאימה)",
		suggestSend: "שליחת הצעה",
		tagProposals: "הצעות לתגיות",
		noProposals: "אין הצעות ממתינות.",
		approveTag: "אישור",
		declineTag: "דחייה",
		tagSlug: "מזהה באנגלית (a-z, מקפים)",
		tagLabelEn: "תווית באנגלית",
		tagLabelHe: "תווית בעברית",
		newLabelSlug: "מזהה הקטגוריה החדשה",
		suggestedBy: "הציע/ה",
		forBook: "על",
		tagApproved: "נוספה לאוצר המילים:",
		declineNote: "מילה בחזרה",
		vocabularyTitle: "אוצר התגיות",
		tagAdd: "הוספת תגית",
		tagGroup: "קבוצה",
		tagNewGroup: "קבוצה חדשה",
		tagNewGroupHint: "רק לקבוצה חדשה: מזהה, ושמה בשתי השפות.",
		tagAddButton: "הוספה",
		renameGroup: "שינוי שם הקבוצה",
		tagRemove: "הסרת התגית",
		tagRemoveHint: "היא תוסר מכל ספר שמסומן בה.",
		tagBuiltin: "מובנית: הספרייה מסמנת בה ספרים חדשים, ולכן היא נשארת.",
		tagAdded: "נוספה:",
		tagSaved: "נשמר.",
		tagRemoved: "הוסרה, וירדה מכל ספר שהיה מסומן בה.",
		tagExists: "התגית הזו כבר קיימת.",
		settledProposals: "כבר הוכרעו",
		sections: "מדורים",
		add: "הוספה",
		filters: "סינון",
		clearFilters: "ניקוי הסינון",
		loadingMore: "טוען…",
		tagsLegend: "תגיות (הן מתארות את הספר, וכל העותקים חולקים אותן)",
		tagsSaved: "התגיות נשמרו.",
		editTags: "עריכת תגיות",
		extrasTags: "תגיות",
		lendLimit: "כמה ספרים מושאלים במקביל, לכל היותר",
		lendLimitAny: "ללא הגבלה",
		lendLimitHint:
			"כשמגיעים למכסה הספרים שלכם נשארים בקטלוג ומסומנים כמושאלים במלואם, ואי אפשר לבקש עוד אחד.",
		awayUntil: "בחופשה עד",
		awayBadge: "הבעלים בחופשה",
		awayHint:
			"נוסעים? כתבו את היום שבו אתם חוזרים. הספרים נשארים בקטלוג, מסומנים כלא זמינים, ואי אפשר לבקש אותם עד אז.",
		awayNowHint:
			"אתם בחופשה. אי אפשר לבקש את הספרים שלכם עד התאריך שלמעלה; מחקו את התאריך כדי לחזור מוקדם יותר.",
		search: "חיפוש",
		searchPlaceholder: "כותרת או מחבר",
		shelf: "המדף שלי",
		addCopy: "הוספת ספר",
		isbn: "מסת״ב",
		mainNav: "ראשי",
		accountNav: "חשבון",
		title: "כותרת",
		authors: "מחברים",
		condition: "מצב",
		lendable: "זמין להשאלה",
		relay: "אפשר להעביר ישירות לקורא הבא",
		note: "הערה",
		cover: "תמונת כריכה",
		coverChoose: "בחירת תמונה",
		coverChange: "בחירת תמונה אחרת",
		coverRemove: "הסרת התמונה",
		coverZoom: "זום",
		coverHint:
			"גררו את הכריכה, או הזיזו אותה במקשי החצים, כדי למקם אותה בתוך המסגרת.",
		save: "שמירה",
		noResults: "לא נמצא דבר בסביבה.",
		notFound: "העמוד הזה לא נמצא על אף מדף",
		notFoundHint:
			"אולי הקישור ישן, או שהספר ירד מהמדף. שום דבר לא אבד, ושאר הספרייה נשארה במקום.",
		notFoundInstead: "אם כבר הגעתם",
		contactTitle: "כתיבה לספרייה",
		contactLede:
			"משוב, שאלה על המידע שלכם, או תלונה. ההודעה מגיעה למנהל/ת הספרייה ולא למודרטורים, כך שאפשר להתלונן גם עליהם.",
		contactTopic: "במה מדובר",
		contactFeedback: "משוב או רעיון",
		contactData: "המידע שלי: עותק, תיקון או מחיקה",
		contactComplaint: "תלונה",
		contactBody: "מה תרצו לומר?",
		contactSend: "שליחה",
		contactSent: "נשלח. התשובה תגיע לכתובת שלמעלה.",
		contactFailed: "ההודעה לא נשלחה. נסו שוב בעוד רגע.",
		contactTooMany:
			"חמש הודעות בשעה זו המכסה. מה שכתבתם לא אבד, נסו שוב בקרוב.",
		contactRights: "בקשה בנוגע למידע נענית תוך חודש. אפשר גם לכתוב ישירות אל",
		emptyShelf: "עדיין לא נוספו ספרים.",
		titlePlaceholder: "למשל: סיפור על אהבה וחושך",
		authorsPlaceholder: "למשל: עמוס עוז (כמה מחברים? הפרידו בפסיק)",
		notePlaceholder: "למשל: עם הקדשה, קצת שחוק בשדרה",
		addThing: "הוספת פריט",
		tabAdd: "הוספה",
		thingName: "מה זה",
		thingNamePlaceholder: "למשל: מקדחה אלחוטית",
		quantity: "כמה",
		quantityHint: "לסט, כמו 12 כיסאות מתקפלים: השכנים יכולים לשאול חלק מהם.",
		photo: "תמונה",
		photoHint:
			"גררו את התמונה, או הזיזו אותה במקשי החצים, כדי למקם אותה בתוך המסגרת.",
		categoryLegend: "קטגוריה",
		thingDetails: "פרטים נוספים",
		brand: "יצרן",
		brandPlaceholder: "למשל: בוש",
		model: "דגם",
		modelPlaceholder: "למשל: PSR 18",
		included: "מה מגיע איתו",
		includedPlaceholder: "למשל: תיק נשיאה, שתי סוללות, מטען",
		needs: "מה השואל מביא",
		needsPlaceholder: "למשל: מקדחים, מיכל גז",
		care: "איך לשמור עליו",
		carePlaceholder: "למשל: לייבש לפני שמקפלים",
		thingNotePlaceholder: "למשל: הציר השמאלי קצת קשה",
		photos: "תמונות (עד ארבע)",
		photosAdd: "הוספת תמונות",
		photosRemove: "הסרה",
		photosHint:
			"גררו תמונה, או השתמשו במקשי החצים, כדי למקם אותה בריבוע. הקטינו כדי להציג אותה כולה.",
		photosMain: "תמונה ראשית",
		photosKeep: "להשאיר",
		photosEarlier: "להזיז מקום אחד קדימה",
		photosLater: "להזיז מקום אחד אחורה",
		photosNew: "חדשה",
		photosRoomNone: "אין מקום לעוד תמונות.",
		photosRoomOne: "אפשר להוסיף עוד תמונה אחת.",
		photosRoomMany: "אפשר להוסיף עוד {n}.",
		productLink: "עמוד המוצר",
		productLinkPlaceholder: "https://…",
		productLinkHint:
			"איפה אפשר לקרוא עליו באתר אחר: עמוד היצרן או חנות, בשביל ההוראות והמפרט.",
		productPage: "עמוד המוצר",
		thingSafety:
			"כלים וציוד עלולים לגרום לפציעה. השאילו רק מה שבטוח לשימוש, וכתבו בפרטים מה השואל צריך לדעת: איך משתמשים, מה צריך ואם יש תקלה.",
		isbnPlaceholder: "13 ספרות, בגב הספר",
		scanHint:
			"שם ומחבר מספיקים. אם לספר יש מסת״ב, הוסיפו אותו בסוף: לרוב הוא מביא איתו גם את הכריכה.",
		signIn: "כניסה",
		email: "אימייל",
		sendLink: "שלחו לי קישור כניסה",
		linkSentTitle: "בדקו את האימייל",
		linkSent:
			"אם הכתובת שייכת לחבר/ה בספרייה, אימייל כניסה כבר בדרך. השתמשו בו תוך 15 דקות, באחת משתי הדרכים:",
		linkSentTapLink: "לחצו על הקישור באימייל. תיכנסו בכל מקום שבו הוא נפתח.",
		linkSentTypeCode:
			"או, אם הוא נפתח בדפדפן או באפליקציה אחרים, הקלידו כאן את הקוד בן שמונה הספרות מהאימייל.",
		linkFailed: "הקישור לא עבד. בקשו קישור חדש.",
		signInCodeLabel: "הקוד מהאימייל",
		signInCodeSubmit: "כניסה עם הקוד",
		sendNewLink: "שליחת קישור חדש, או לכתובת אחרת",
		signInCodeFailed: "הקוד לא עבד. בדקו את האימייל האחרון, או בקשו קישור חדש.",
		finishSignIn: "נגיעה אחת כדי לסיים את הכניסה במכשיר הזה.",
		join: "הצטרפות לספרייה",
		joinHint: "הוזמנתם. הזינו אימייל לקבלת קישור כניסה.",
		inviteUsedUp: "ההזמנה הזו כבר נוצלה. בקשו ממי ששלח אותה הזמנה חדשה.",
		inviteExpired: "תוקף ההזמנה הזו פג. בקשו ממי ששלח אותה הזמנה חדשה.",
		alreadyMember: "כבר חברים בספרייה?",
		welcome: "ברוכים הבאים",
		welcomeHint: "שם שהשכנים מכירים, ובערך איפה אתם. אין צורך בכתובת המדויקת.",
		displayName: "שם",
		areaLabel: "שכונה",
		locate: "השתמשו במיקום שלי",
		mapMore: "לא ברשימה? סמנו את עצמכם על המפה",
		located: "התקבל — נשמר בקירוב, לא במדויק.",
		locateFailed: "לא הצלחנו לקבל מיקום. כתבו את השכונה במקום.",
		language: "שפה",
		editEditionsFirst:
			"לספר הזה יש יותר ממהדורה אחת, ולכן אי אפשר להחליף כאן את הכריכה. מזגו אותן קודם.",
		workNote: "על הספר",
		workNoteHint: "כמה מילים שכולם רואים: המהדורה, סדרה, תרגום, השנה.",
		workNoteFromCopy:
			"מולא מההערה שכתב/ה אחד הבעלים. השאירו רק את מה שמתאר את הספר עצמו לפני השמירה.",
		profile: "החשבון שלי",
		areaRequired: "קודם קבעו את האזור שלכם — המרחקים על המדפים תלויים בו.",
		areaMissing: "בחרו נקודה על המפה או השתמשו במיקום.",
		areaLabelHint: "למשל: צ׳רץ׳ אנד",
		extend: "הארכה בשבוע",
		extendForThem: "לתת עוד שבוע",
		extended: "מועד ההחזרה נדחה בשבוע.",
		extendWaiting: "מישהו מחכה לספר הזה, אז רק הבעלים יכולים להאריך.",
		reportProblem: "דיווח על בעיה",
		reportKind: "מה קרה",
		reportBody: "פרטים",
		reportHint:
			"מגיע רק למודרטורים. שום דבר לא נקבע אוטומטית; ספר שאבד יורד מהמדפים.",
		reportSend: "שליחת דיווח",
		reportAbout: "לגבי",
		readThread: "קריאת השיחה",
		noReportThread: "לדיווח הזה אין שיחה לקרוא.",
		moderationNote:
			"אתם קוראים שיחה פרטית מפני שהיא דווחה. קראו את מה שנדרש כדי להכריע, ולא מעבר לכך. אפשר לכתוב למי שדיווח/ה מתחת לדיווח; הצד השני לא רואה זאת.",
		resolve: "טופל",
		dismiss: "ביטול",
		bookTurnedUp: "הספר נמצא",
		borrow: "בקשת השאלה",
		requestRelay: "לבקש להיות הבא/ה בתור",
		waitlistJoin: "עדכנו אותי כשעותק מתפנה",
		waitlistJoined: "אתם ברשימה. כשעותק יתפנה תקבלו זכות ראשונים.",
		waitlistLeave: "יציאה מהרשימה",
		waitlistHint: "אי אפשר לבקש עותק כרגע.",
		waitlistTitle: "מחכים ל",
		waitlistEmpty: "אתם לא מחכים לשום דבר.",
		showPastLoans: "להציג שהוחזרו ובוטלו",
		hidePastLoans: "להסתיר שהוחזרו ובוטלו",
		relaying: "מעבירים הלאה",
		relayingHint:
			"ספרים שאצלכם שעוברים ישירות לקורא/ת הבא/ה. תאמו מסירה בכל השאלה.",
		availabilityTitle: "מתי אפשר להיפגש",
		profilePrefs: "השאלה ושפה",
		availabilityHint:
			"סמנו מתי בדרך כלל נוח לכם למסור ספר. זמנים משותפים עם הצד השני מוצעים קודם.",
		meetingPlace: "איפה נפגשים (פרטי)",
		meetingPlaceHint: "למשל: רחוב הכנסייה 12, פעמון עליון — או בית הקפה בפינה",
		meetingNote: "הערה למי שמגיע/ה (פרטי)",
		meetingNoteHint:
			"למשל: נא לדפוק, לא לצלצל — התינוק ישן. או: זה בקופסה ליד הדלת.",
		meetingPlacePrivacy: "מוצג רק למי שמקבל/ת מכם ספר, ורק אחרי שנקבע מועד.",
		handoffOut: "מסירה",
		addToCalendar: "הוספה ליומן:",
		otherCalendars: "Apple, Outlook ואחרים",
		handoffBack: "החזרה",
		pickSlot: "בחרו מועד שנוח לכם:",
		theirGridEmpty: "הצד השני עוד לא מילא זמנים — הציעו אחד משלכם.",
		noSlots: "אף אחד מכם עוד לא קבע זמנים.",
		bothFree: "פנוי לשניכם",
		oneFree: "פנוי לאחד מכם",
		slotPending: "הוצע, ממתין לתשובה",
		proposeTime: "להציע את המועד הזה",
		proposeAnother: "להציע מועד אחר",
		youProposed: "הצעתם",
		theyProposed: "הוצע לכם",
		confirmTime: "אישור",
		withdraw: "ביטול ההצעה",
		suggestAnother: "להציע אחר",
		changeTime: "שינוי המועד",
		meetAt: "איפה:",
		placeMissingHost:
			"עוד לא ציינתם איפה נפגשים. הצד השני רואה את המקום אחרי שנקבע מועד.",
		setPlace: "קביעת מקום המפגש",
		yourCode: "קוד המסירה שלכם:",
		codeHint: "הקריאו אותו בפגישה; השואל/ת מקליד/ה אותו לאישור.",
		enterCode: "הקוד מהמשאיל/ה",
		confirmHandoff: "אישור מסירה",
		wrongCode: "הקוד לא נכון. בקשו מהמשאיל/ה לקרוא שוב.",
		timeAgreed: "המועד נקבע.",
		handoffDone: "המסירה אושרה.",
		editAvailability: "עריכת הזמנים שלכם",
		needsTime: "בחרו מועד",
		needsTimeHint:
			"אושר לפני יום ועוד אין מועד. בחרו אחד למטה כדי שהספר יעבור ידיים.",
		setAvailability: "קביעת הזמנים שלכם",
		availabilityNudge:
			"עוד לא ציינתם מתי אפשר להיפגש. מלאו את הזמנים שלכם, וקל יהיה לתאם מסירה.",
		fallbackHanded: "נפגשתם בלי קוד? השתמשו ב״סימון: נמסר״ למטה.",
		connectTitle: "חיבור עוזר",
		connectIntro:
			"Claude, ChatGPT, Claude Code ולקוחות MCP אחרים יכולים להשתמש בספרייה בשמכם. כתובת השרת:",
		connectCan: "מה עוזר יכול לעשות בשבילכם",
		connectCannot: "מה הוא לא יכול",
		connectManage: "כל חיבור מופיע בפרופיל שלכם, ושם אפשר לנתק אותו.",
		connect: "חיבור עוזר",
		notIsbn:
			"הברקוד הזה אינו מסת״ב (מסת״ב מתחיל ב־978 או 979). לדאנאקוד ולקודים אחרים אין רשומה בקטלוג — מלאו כותרת ומחבר והוסיפו צילום כריכה.",
		consentTitle: "חיבור אפליקציה",
		consentAsks: "מבקשת גישה לספרייה בתור",
		consentReturnsTo: "אם תאשרו, תחזרו אל",
		consentHint:
			"מסומנת רק צפייה. סמנו את השאר רק אם אתם רוצים שהיא תפעל בשמכם — תשלח הודעות, תבקש ספרים. אפשר לנתק בכל עת מהפרופיל. היא לעולם לא תראה כתובות או אימיילים של חברים אחרים.",
		consentApprove: "אישור",
		consentDeny: "ביטול",
		consentBad: "בקשת החיבור חסרה. התחילו מחדש מהאפליקציה.",
		connectedApps: "אפליקציות מחוברות",
		addFailed: "לא הצלחנו לשמור. נסו שוב.",
		wantedTitle: "לא מצאתם? בקשו את הספר",
		wantedHint:
			"נרשום אותו ברשימת ההמתנה שלכם. העותק הראשון שיירשם יישמר לכם ל־48 שעות.",
		wantedAuthors: "מחבר/ת",
		wantedAsk: "בקשת הספר",
		wantedFailed: "לא הצלחנו לרשום את הבקשה.",
		lookingFor: "שכנים מחפשים",
		haveIt: "יש לכם? הוסיפו עותק",
		share: "שיתוף",
		copyLink: "העתקת קישור",
		copy: "העתקה",
		copied: "הועתק",
		linkCopied: "הקישור הועתק",
		ogTagline: "ספרייה שכונתית",
		teaserSignIn: "התחברו כדי לראות למי יש אותו לידכם ולבקש אותו.",
		teaserJoin: "עוד לא חברים? בקשו קישור הצטרפות ממי ששלח/ה לכם את זה.",
		apiTitle: "REST API",
		webhooksTitle: "Webhooks",
		webhooksIntro:
			"קבלו POST חתום כשמשהו קורה: ספר נרשם, השאלה אושרה, מסירה אושרה. נמסר לפחות פעם אחת, מנסה שוב במשך יום, ואז נזנח.",
		webhookUrl: "כתובת (https)",
		webhookKinds: "אילו אירועים",
		webhookAllHint: "השאירו הכול לא מסומן כדי לקבל הכול.",
		webhookCreate: "הרשמה",
		webhookSecretOnce: "סוד החתימה שלכם. העתיקו עכשיו; הוא לא יוצג שוב.",
		webhookFailed: "ההרשמה נכשלה. בדקו את הכתובת.",
		webhookDone: "סיום",
		webhookAll: "כל האירועים",
		webhookTest: "שליחת פינג",
		webhookRemove: "הסרה",
		webhookPingOk: "הפינג נמסר.",
		webhookRemoved: "ה-webhook הוסר.",
		webhookDisabled: "כובה אחרי כישלונות חוזרים; פינג מוצלח מדליק אותו מחדש",
		apiIntro:
			"כל מה שהאתר עושה, סקריפט יכול לעשות. אותם נתיבים, אותן הרשאות, JSON פנימה והחוצה.",
		apiSpec: "מסמך OpenAPI",
		tokenTitle: "טוקן אישי",
		tokenIntro:
			"לסקריפטים שלכם. בחרו מה מותר לו; הוא מוצג פעם אחת ופג אחרי שנה.",
		tokenName: "שם (למה הטוקן משמש?)",
		tokenCreate: "יצירת טוקן",
		tokenShownOnce: "העתיקו עכשיו; הוא לא יוצג שוב.",
		tokenCopy: "העתקה",
		tokenCopied: "הועתק",
		tokenFailed: "לא הצלחנו ליצור את הטוקן.",
		tokenSignIn: "התחברו כדי ליצור טוקן.",
		noApps: "אין אפליקציות מחוברות.",
		appRevoked: "נותק.",
		disconnect: "ניתוק",
		terms: "תנאים",
		privacy: "פרטיות",
		privacyVersion: "גרסה 1 \u2014 ספטמבר 2026.",
		termsVersion: "גרסה 1 — ספטמבר 2026.",
		termsHint: "בכניסה אתם מאשרים שאתם בני 18 ומעלה ומסכימים לתנאים.",
		attention: "דורש מודרטור/ית",
		attentionNone: "כרגע שום דבר לא דורש אתכם.",
		attentionHint:
			"השאלות באיחור של יותר מ־14 יום ובקשות ללא מענה יומיים יופיעו כאן.",
		lookingUp: "מחפשים…",
		isbnNotFound:
			"אין רשומה למסת״ב הזה. מלאו כותרת ומחבר למטה והספר יירשם בכל זאת.",
		isbnFound: "נמצא",
		yours: "שלכם",
		markHanded: "סימון: נמסר",
		markReturned: "סימון: הוחזר",
		nudge: "תזכורת",
		nudgeSent: "התזכורת נשלחה.",
		nudgedRecently: "כבר נשלחה תזכורת היום — פעם ביום מספיק.",
		nothingYetHint: "היו הראשונים: הוסיפו ספר מהמדף שלכם.",
		emptyShelfHint: "הקלידו כותרת ומחבר — זה לוקח דקה.",
		manage: "ניהול",
		browse: "עיון",
		tabOverview: "סקירה",
		assets: "ספרים",
		overviewHint:
			"המספרים מקשרים לרשימות. השאלות תקועות ודיווחים יופיעו כאן כשיהיו מסירות.",
		inviteHint:
			"פרסמו את הקישור בקבוצה. כל קישור מפסיק לעבוד כשנגמרים השימושים או הימים.",
		assetSearch: "כותרת, מחבר או בעלים",
		noAssets: "אין ספרים תואמים.",
		colOwner: "בעלים",
		colLoan: "השאלה",
		colAdded: "נוסף",
		retire: "הסרה מהקטלוג",
		assetRetired: "הוסר. הוא נעלם מהקטלוג; הבעלים שומרים את הרשומה.",
		noRequestsHint: "מצאו משהו על המדפים ובקשו אותו.",
		messages: "הודעות",
		noSuchLoan: "אין השאלה כזו.",
		noMessages: "אין עדיין הודעות. כתבו מתי ואיפה נוח לכם.",
		noMessagesAgreed: "אין עדיין הודעות. כתבו כאן אם משהו משתנה.",
		acceptedMeetingSet: "אושר — המפגש נקבע",
		writeMessage: "כתבו הודעה",
		send: "שליחה",
		theModerators: "המודרטורים",
		allMembers: "להצגת כל החברים",
		adminMessages: "הודעות",
		logTab: "יומן",
		statActiveLoans: "השאלות פעילות",
		adminLoansOpen: "פתוחות",
		adminLoansAll: "הכול",
		adminLoansNone: "אין השאלות.",
		adminLoansBook: "ספר",
		adminLoansLender: "משאיל/ה",
		adminLoansBorrower: "שואל/ת",
		adminLoansSince: "מאז",
		adminLoansDue: "להחזרה עד",
		adminLoansOverdue: "באיחור",
		theirData: "המידע שלהם",
		theirDataHint:
			"לבקשת מידע: עותק של כל מה שהספרייה שומרת עליהם, או מחיקתם. שתי הפעולות נרשמות ביומן.",
		exportData: "הורדת המידע שלהם",
		eraseMember: "מחיקת החבר/ה",
		eraseHint:
			"הכתובת, השם, האזור, מקום המפגש, ההודעות, המכשירים והאפליקציות המחוברות נמחקים, והספרים יורדים מהמדפים. השאלות שהיו נשארות, בלי שם בצד שלהם. אי אפשר לבטל. לא אפשרי כשיש להם השאלה פתוחה, או כשהם מנהלים.",
		eraseButton: "מחיקה לצמיתות",
		eraseBlocked:
			"יש להם עדיין השאלה פתוחה, או שהם מנהלים. סגרו את ההשאלה או שנו את התפקיד קודם.",
		memberErased: "החבר/ה נמחק/ה.",
		dataRequestsOpen: "בקשות מידע ממתינות",
		openInvitesTitle: "קישורי ההזמנה הפתוחים שלהם",
		noOpenInvites: "אין קישורים פתוחים.",
		revokeTheirInvites: "ביטול כל קישורי ההזמנה שלהם",
		logHint:
			"כל שינוי שנעשה דרך המודרציה, ומי עשה אותו. רק המנהל/ת רואה את זה.",
		logNone: "עוד לא שונה דבר.",
		logWhen: "מתי",
		logWho: "מי",
		logWhat: "מה",
		logDetails: "פרטים",
		settingsTab: "הגדרות",
		myTagging: "תיוג הספרים שלי",
		myTaggingHint:
			"סמנו מה שמתאים. ערך חסר שמוקלד בקבוצה נשלח למודרטורים כהצעה, ומופיע על הספר כשהם מאשרים. Enter שומר.",
		myTaggingLink: "תיוג מהיר של הספרים שלי",
		settingsSaved: "נשמר.",
		formSaving: "שומר…",
		formSaved: "נשמר.",
		settingsName: "שם הספרייה",
		settingsWords: "איך הספרייה מציגה את עצמה",
		settingsWordsHint:
			'מופיע בעמוד הראשי, בתצוגה המקדימה של קישורים ובעמוד "על הספרייה", בכל שפה שהספרייה מציעה. שדה ריק לא מציג כלום.',
		settingsTextName: "השם בשפה הזו",
		settingsTextNameHint: "ריק: השם שלמעלה.",
		settingsShortName: "שם קצר",
		settingsShortNameHint:
			"מילה או שתיים למקומות צפופים: הכותרת בטלפון והשם מתחת לסמל במסך הבית. ריק: „ספרייה”.",
		settingsTagline: "שורה אחת מתחת לשם",
		settingsAbout: "למי הספרייה מיועדת",
		settingsLanguage: "שפת ברירת המחדל",
		settingsCentre: "איפה הספרייה",
		settingsCentreHint:
			"שכונה, רחוב או מיקוד קרוב לאמצע. מקומות שחברים מקלידים מחפשים כאן בסביבה, והמרחקים נמדדים מכאן.",
		settingsCentreMark: "הספרייה",
		settingsCentreMap: "לא ברשימה? סמנו על המפה",
		settingsRadius: "עד כמה רחוק היא מגיעה",
		settingsRadiusHint:
			"בערך כמה רחוק מהאמצע גרים החברים. כשכולם גרים קרוב לא מוצגים מרחקים, אבל זה עדיין שומר את ההצעות לקרובות.",
		settingsLanguages: "השפות שהספרייה מציעה",
		settingsLanguagesBoth: "עברית ואנגלית",
		settingsLanguagesEn: "אנגלית בלבד",
		settingsLanguagesHe: "עברית בלבד",
		settingsLanguagesHint:
			"עם שפה אחת אין מעבר בין שפות, וכל העמודים בה. שפת ברירת המחדל צריכה להיות אחת מהן.",
		settingsAccent: "הצבע של הספרייה",
		settingsAccentHint:
			"הכפתורים, הקישורים ושם הספרייה מקבלים את הצבע הזה. כשקשה לקרוא אותו, הוא מוכהה או מובהר, במצב בהיר ובמצב כהה.",
		settingsAccentHouse: "הירוק של הבית",
		settingsAccentOwn: "צבע משלכם",
		settingsSize: "כמה רחוק החברים גרים זה מזה",
		settingsSizeWide: "פרוסים על אזור: כל חבר מציין איפה הוא גר",
		settingsSizeCompact: "כולם קרובים: בלי אזורים ובלי מפה",
		settingsSizeHint:
			"בספרייה שפרוסה על שכונה או עיר, החברים מציינים אזור משוער, והספרים מראים כמה הם רחוקים. כשכולם גרים במרחק כמה דקות זה מזה (בניין, רחוב, קהילה), זה לא אומר כלום: האזור, המפה והמרחקים לא מוצגים.",
		setupNameTitle: "השם שלכם",
		setupNameHint: "איך השכנים יכירו אתכם.",
		settingsLanguageHint:
			"השפה שבה האתר נפתח למי שעוד לא בחר/ה שפה. כל אחד יכול להחליף מהתפריט, וקישור יכול לשאת ‎?lang=he או ‎?lang=en.",
		settingsLoanDays: "משך השאלה בימים (אלא אם הבעלים קבעו אחרת)",
		settingsInvitesOpen: "כמה קישורי הזמנה פתוחים מותר לחבר/ה בו־זמנית",
		settingsInvitesOpenHint: "0 משאיר את ההזמנות למודרטורים.",
		settingsInviteDays: "כמה ימים קישור הזמנה של חבר/ה בתוקף",
		onlyAdmin:
			"אתם המנהל/ת היחיד/ה של הספרייה. אם תיעדרו, אף אחד לא יוכל לעשות מה שרק מנהל/ת יכול/ה.",
		onlyAdminLink: "מינוי מנהל/ת נוסף/ת",
		adminsOnly: "עמוד זה מיועד למנהל/ת הספרייה.",
		adminMessagesHint:
			'כל מה שנכתב דרך "כתיבה לספרייה", מהחדש לישן. המודרטורים לא רואים את ההודעות האלה.',
		adminMessagesNone: "אין עדיין הודעות.",
		adminMessagesVisitor: "אורח/ת",
		adminMessagesMark: "סימון כטופל",
		adminMessagesReopen: "פתיחה מחדש",
		newer: "חדשות יותר",
		older: "ישנות יותר",
		tagging: "תיוג",
		taggingWhich: "ספרים",
		taggingUntagged: "בלי תגיות",
		taggingAll: "הכול",
		taggingDone: "לכל הספרים יש תגיות. לא נשאר מה לתייג.",
		taggingNone: "אין עדיין ספרים.",
		taggingSaveNext: "שמירה והבא",
		taggingBack: "הקודם",
		taggingSkip: "דילוג",
		taggingHint:
			"סמנו מה שמתאים. ערך חדש שמוקלד בקבוצה הופך לתגית; את השפה השנייה שלו אפשר להגדיר בעמוד התגיות. Enter שומר.",
		noSuchMember: "אין חבר/ה כזה/ו בקהילה.",
		memberJoined: "הצטרפות",
		memberLoans: "השאלות",
		changeRoleOrStatus: "שינוי תפקיד או מצב",
		cameInHow: "איך הגיעו",
		invitedByLabel: "הוזמנו על ידי",
		noInviter:
			"אין הזמנה ברישום: היו כאן מההתחלה, או הצטרפו לפני שהזמנות נשמרו.",
		inviteTrail: "שרשרת ההזמנות",
		inviteTrailHint:
			"כל אחד/ת הוזמנו על ידי מי שמתחתיהם, עד מי שהתחיל/ה את השרשרת.",
		theyInvited: "מי שהזמינו",
		invitedNobody: "עדיין אף אחד.",
		reportsTheyFiled: "דיווחים שהגישו",
		reportsAboutThem: "דיווחים עליהם",
		noReportsFiled: "אין.",
		noReportsAbout: "אין.",
		writeToModerators: "כתיבה למודרטורים",
		settleCancelled: "ביטול ההשאלה",
		settleReturned: "הספר חזר",
		settleLost: "הספר אבד",
		settleLostConfirm: "לסמן שהספר אבד? הוא יורד מהמדפים עד שמישהו יחזיר אותו.",
		settleLostYes: "כן, הוא אבד",
		settleHint:
			"אי אפשר לשלוח הודעות או תזכורות לחבר מושעה. סגרו את ההשאלה כשברור איפה הספר.",
		loanSettled: "ההשאלה נסגרה.",
		threadClosed: "ההשאלה נסגרה; השיחה לקריאה בלבד.",
		viewBookPage: "לעמוד הספר",
		saved: "נשמר.",
		copyLocked: "לעותק הזה יש השאלה בתהליך. סיימו אותה קודם.",
		copyLockedHint: "השאלה בתהליך; שינוי זמינות והסרה יחכו לסיומה.",
		editionShared:
			"חברים אחרים רשמו את המהדורה הזו, ולכן הכותרת והמחברים משותפים.",
		editionSharedHint:
			"הכותרת והמחברים מגיעים מהמהדורה המשותפת ואי אפשר לערוך אותם כאן.",
		coverFailed: "הכריכה לא נשמרה. נסו תמונה קטנה יותר.",
		lendingPolicy: "השאלה",
		lendingLendable: "זמין להשאלה",
		lendingPaused: "מושהה — נשאר ברשימה, לא מושאל כרגע",
		lendingReference: "לעיון בלבד — מוצג, לא מושאל",
		loanDays: "משך השאלה (ימים)",
		loanDaysDefault: "ברירת המחדל של הקהילה",
		replaceCover: "החלפת כריכה",
		removeHeading: "הסרה",
		removeFromShelf: "הסרת הספר מהמדף שלי",
		removeConfirm: "להסיר? הוא ייעלם מהקטלוג. השאלות עבר נשמרות.",
		removeYes: "כן, להסיר",
		removeNo: "להשאיר",
		removed: "הוסר מהמדף שלכם.",
		mapHint:
			"הקישו בערך איפה אתם גרים. נשמר בדיוק של כ־300 מטר, אף פעם לא הכתובת.",
		signOut: "יציאה",
		landingInvite:
			"שכן או שכנה שכבר חברים בספרייה שולחים לכם קישור הצטרפות. כבר חברים? היכנסו עם האימייל.",
		landingInviteTitle: "בהזמנה",
		landingLend: "משאילים",
		landingBorrow: "שואלים",
		landingReturn: "מחזירים",
		aboutLibrary: "איך זה עובד",
		landingInviteShort:
			"שכן או שכנה שכבר חברים בספרייה שולחים לכם קישור הצטרפות.",
		guestShelves: "על המדפים",
		membersOnlyTitle: "רק חברים יכולים לשאול",
		membersOnlyBody:
			"הספרייה פועלת בהזמנה. כל שכן או שכנה שכבר חברים יכולים לשלוח לכם הזמנה, אז שאלו מישהו שאתם מכירים כאן.",
		membersOnlySignIn: "אני חבר/ה: כניסה",
		keepLooking: "להמשיך לחפש",
		linkNeedsInvite: "לא הגיע כלום? ייתכן שצריך קודם הזמנה מחבר בספרייה.",
		admin: "מודרציה",
		skipToContent: "דלגו לתוכן",
		viewAsMember: "תצוגה כחבר/ה",
		viewingAsMember: "אתם רואים את הספרייה כמו חבר/ה רגיל/ה.",
		viewAsModerator: "חזרה לתצוגת המודרטורים",
		moderatorsOnly: "עמוד זה מיועד למודרטורים.",
		adminActionFailed: "הפעולה לא הצליחה. נסו שוב.",
		statMembers: "חברים",
		statModerators: "מודרטורים",
		statCopies: "עותקים",
		statLendable: "זמינים להשאלה",
		statInvites: "הזמנות פעילות",
		invites: "הזמנות",
		inviteCreated: "קישור ההזמנה שלכם. העתיקו אותו עכשיו, הוא לא יוצג שוב.",
		inviteUses: "שימושים",
		inviteDays: "תוקף בימים",
		inviteCreate: "יצירת הזמנה",
		inviteByEmail: "הזמנה באימייל",
		inviteByEmailHint:
			"יגיע אליהם קישור אחד שמצרף ומכניס אותם. אין מה להעביר הלאה.",
		inviteEmailSend: "שליחת הזמנה",
		inviteEmailSent: "ההזמנה נשלחה.",
		inviteAlreadyMember: "הכתובת הזו כבר שייכת לחבר/ה בספרייה.",
		inviteEmailRate: "אפשר לשלוח עד שלושים הזמנות ביום. נסו שוב מחר.",
		inviteLinkTitle: "קישור הזמנה",
		colSentTo: "נשלחה אל",
		inviteLive: "פעילה",
		inviteSpent: "נוצלה / פגה",
		inviteRevoked: "בוטלה",
		revoke: "ביטול",
		members: "חברים",
		navPeople: "אנשים",
		navBooks: "ספרים",
		navLibrary: "הספרייה",
		colCreatedBy: "נוצר על ידי",
		colUses: "שימושים",
		colExpires: "פג תוקף",
		colStatus: "מצב",
		colName: "שם",
		colEmail: "אימייל",
		colArea: "אזור",
		colRole: "תפקיד",
		colCopies: "עותקים",
		colLastSeen: "נראה לאחרונה",
		colMeeting: "מוכנות למפגש",
		meetingPlaceSet: "מקום",
		availabilitySet: "זמנים",
		notSetYet: "עוד לא הוגדר",
		roleModerator: "מודרטור/ית",
		roleAdmin: "מנהל/ת",
		roleMember: "חבר/ה",
		promote: "מינוי למודרטור/ית",
		demote: "הסרת מודרטור/ית",
		makeAdmin: "מינוי למנהל/ת",
		removeAdmin: "הסרת ניהול",
		demoteSelfConfirm:
			"להסיר מעצמכם את תפקיד המודרטור/ית? העמוד הזה ייעלם עד שמודרטור/ית אחר/ת יחזירו אותו.",
		demoteSelfYes: "כן, להסיר את התפקיד שלי",
		suspend: "השעיה",
		reinstate: "החזרה",
		onTheShelves: "על המדפים לידכם",
		allBooks: "כל הספרים",
		filterAvailable: "פנויים עכשיו",
		filterShow: "הצגה",
		filterShowMine: "עם שלי",
		filterShowRead: "עם אלה שקראתי",
		markRead: "קראתי",
		wishlist: "רוצה לקרוא",
		wishlistTab: "לקריאה",
		contactShort: "יצירת קשר",
		profileQuick: "החשבון שלך",
		deviceTitle: "כניסה ממכשיר אחר",
		deviceHint:
			"קישור שמכניס אתכם מהטלפון או ממחשב אחר, בלי לחכות לאימייל. הוא עובד פעם אחת, לעשר דקות. מי שמחזיק בו יכול להיכנס בשמכם, אז פתחו אותו רק במכשיר שלכם.",
		deviceCreate: "יצירת קישור",
		deviceAgain: "יצירת קישור חדש",
		deviceCreating: "יוצר…",
		deviceFailed: "לא הצלחנו ליצור קישור. נסו שוב.",
		deviceTooMany: "אפשר ליצור עד חמישה קישורים בשעה. נסו שוב מאוחר יותר.",
		deviceScan: "סרקו את הקוד במצלמה של המכשיר השני:",
		deviceOrCopy: "או העתיקו את הקישור ופתחו אותו שם:",
		deviceQrAlt: "קוד QR של קישור הכניסה",
		deviceUntil: "עובד פעם אחת, עד {time}.",
		wishlistEmpty: "עוד לא נשמר כאן כלום.",
		emptyBrowse: "לעיון בספרייה",
		wishlistEmptyHint:
			"לחצו על „רוצה לקרוא” בעמוד של ספר כדי לשמור אותו כאן. תקבלו הודעה כשעותק קרוב יתפנה.",
		wishlistHint: "תקבלו הודעה כשאחד מאלה יתפנה קרוב אליכם.",
		wishlistWithoutCopies: "לאף אחד כאן אין אותם כרגע",
		sortBy: "סדר",
		sortNew: "חדשים",
		sortTitle: "לפי שם",
		sortDistance: "הקרובים",
		filterDistance: "מרחק",
		anyDistance: "הכול",
		nothingYet: "אין עדיין מה לשאול. הוסיפו ספר כדי להתחיל.",
		more: "עוד",
		noSuchBook: "אין ספר כזה.",
		copiesNearby: "עותקים בסביבה",
		noCopies: "לאף אחד בסביבה אין כרגע עותק להשאלה.",
		you: "אתם",
		request: "בקשה",
		requestNote: "הערה לבעלים",
		requiredKey: "חובה למלא",
		requestSent:
			"הבקשה נרשמה. הבעלים ישמעו עליה בעוד חמש דקות; עד אז אפשר לבטל אותה בהשאלות.",
		requestTaken: "למישהו אחר יש כבר בקשה פתוחה על העותק הזה.",
		requestFailed: "הפעולה לא הצליחה. נסו שוב.",
		requestAway: "הבעלים לא נמצאים כרגע. בקשו שוב כשיחזרו.",
		requestLimit:
			"הבעלים משאילים כבר כמה שהם יכולים בבת אחת. בקשו שוב כשמשהו יחזור.",
		requestHold: "זה שמור כרגע למישהו מרשימת ההמתנה.",
		requestCount: "כבר אין כל כך הרבה פנויים.",
		requestAsked: "כבר יש לכם חלק מהסט הזה.",
		requestUnavailable: "אי אפשר לבקש את זה כרגע.",
		bookEdited: "תוקן.",
		mergeFailed:
			"לא ניתן לאחד אותם: אולי אלה ספרים שונים, או שהם לא רק שלכם. מודרטור יכול.",
		inviteWithdrawn: "ההזמנה בוטלה.",
		youRequested: "ביקשתם את העותק הזה.",
		youAgreed: "אושר: תאמו מתי לאסוף.",
		yourLoan: "להשאלה שלכם",
		loans: "השאלות",
		incoming: "בקשות לספרים שלי",
		noIncoming: "אף אחד לא מבקש כרגע את הספרים שלכם.",
		myRequests: "הבקשות שלי",
		noRequests: "אין לכם בקשות פתוחות.",
		accept: "אישור",
		decline: "דחייה",
		cancel: "ביטול",
		loanActionFailed: "הפעולה לא הצליחה. נסו שוב.",
	},
} satisfies Record<Locale, Record<string, string>>;

type Dictionary = (typeof dictionary)["en"];

/** Parameterised strings; the plain ones live in the dictionary. */
function helpers(locale: Locale) {
	const he = locale === "he";
	const conditions: Record<string, string> = he
		? { new: "חדש", good: "טוב", worn: "משומש", fragile: "שביר" }
		: { new: "new", good: "good", worn: "worn", fragile: "fragile" };
	const states: Record<string, string> = he
		? {
				shelved: "על המדף",
				reserved: "שמור",
				in_transit: "בדרך",
				on_loan: "מושאל",
				unavailable: "לא זמין",
				lost: "אבד",
				retired: "הוסר",
			}
		: {
				shelved: "on the shelf",
				reserved: "reserved",
				in_transit: "in transit",
				on_loan: "on loan",
				unavailable: "unavailable",
				lost: "lost",
				retired: "retired",
			};
	const loanStatuses: Record<string, string> = he
		? {
				requested: "ממתין לתשובה",
				accepted: "אושר — לתאם מסירה",
				declined: "נדחה",
				active: "בהשאלה",
				completed: "הוחזר",
				cancelled: "בוטל",
				lost: "אבד",
			}
		: {
				requested: "waiting for an answer",
				accepted: "accepted — arrange the handoff",
				declined: "declined",
				active: "on loan",
				completed: "returned",
				cancelled: "cancelled",
				lost: "lost",
			};
	const availabilityOf = (copy: {
		state: string;
		lending: string;
		relayAllowed: boolean;
		ownerAtLimit?: boolean;
		ownerAway?: boolean;
		ownerBackOn?: number | null;
		quantity?: number;
		free?: number | null;
	}): string => {
		// The book is on its shelf, its owner is not here to hand it over.
		if (copy.ownerAway && copy.state === "shelved") {
			if (!copy.ownerBackOn) return he ? "בחופשה" : "away";
			const back = dateFormat(he ? "he" : "en", {
				day: "numeric",
				month: "short",
			}).format(copy.ownerBackOn * 1000);
			return he ? `בחופשה · חוזרים ב־${back}` : `away · back ${back}`;
		}
		// The owner has as many out as they lend at once: listed, not lendable today.
		if (copy.ownerAtLimit && copy.state === "shelved") {
			return he ? "הבעלים בשיא ההשאלות" : "owner is fully lent out";
		}
		// A set: how many of it are free right now.
		if (
			copy.state === "shelved" &&
			copy.lending === "lendable" &&
			(copy.quantity ?? 1) > 1 &&
			copy.free != null
		) {
			if (copy.free === 0) return he ? "כולם בחוץ" : "all out";
			return he
				? `${copy.free} מתוך ${copy.quantity} פנויים`
				: `${copy.free} of ${copy.quantity} free`;
		}
		if (copy.state === "shelved" && copy.lending === "lendable") {
			if (he) return copy.relayAllowed ? "זמין · אפשר להעביר הלאה" : "זמין";
			return copy.relayAllowed ? "available · may pass on" : "available";
		}
		if (copy.state === "shelved" && copy.lending === "reference") {
			return he ? "לעיון בלבד" : "reference only";
		}
		if (copy.state === "shelved") return he ? "מושהה" : "paused";
		if (copy.state === "on_loan" && copy.relayAllowed) {
			return he ? "מושאל · אפשר להעביר הלאה" : "on loan · may pass on";
		}
		return states[copy.state] ?? copy.state;
	};
	const plural = (n: number, one: string, many: string) =>
		n === 1 ? one : many;
	return {
		availability: availabilityOf,
		onLoanFor: (d: number) => (he ? `יום ${d + 1}` : `day ${d + 1}`),
		dueIn: (d: number) =>
			he
				? `להחזרה בעוד ${d} ${plural(d, "יום", "ימים")}`
				: `due in ${d} ${plural(d, "day", "days")}`,
		overdueBy: (d: number) =>
			he
				? `באיחור של ${d} ${plural(d, "יום", "ימים")}`
				: `overdue by ${d} ${plural(d, "day", "days")}`,
		unansweredFor: (d: number) =>
			he
				? `ללא מענה ${d} ${plural(d, "יום", "ימים")}`
				: `unanswered for ${d} ${plural(d, "day", "days")}`,
		counterpartSuspended: (name: string) =>
			he
				? `החשבון של \u2068${name}\u2069 מושעה`
				: `\u2068${name}\u2069 is suspended`,
		counterpartSuspendedBody: (name: string) =>
			he
				? `המודרטורים של הספרייה השעו את החשבון של \u2068${name}\u2069, ולכן הודעות ותזכורות כבר לא מגיעות אליו. כדי להסדיר את ההשאלה, להחזיר או לקבל את הספר או כל דבר אחר, כתבו למודרטורים.`
				: `The library's moderators suspended \u2068${name}\u2069, so messages and nudges no longer reach them. To sort out this loan, whether it is getting the book back or anything else, write to the moderators.`,
		composerSuspended: (name: string) =>
			he
				? `אי אפשר לשלוח הודעות ל\u2068${name}\u2069 כל עוד החשבון מושעה.`
				: `Messages cannot reach \u2068${name}\u2069 while they are suspended.`,
		externalSite: (host: string) =>
			he ? `באתר חיצוני: ${host}` : `on an outside website: ${host}`,
		setOf: (n: number) => (he ? `סט של ${n}` : `A set of ${n}`),
		partOfSet: (n: number, of: number) =>
			he ? `${n} מתוך ${of}` : `${n} of ${of}`,
		howManyAsk: (free: number) =>
			he ? `כמה (עד ${free})` : `How many (up to ${free})`,
		reportRelayHint: (owner: string) =>
			he
				? `הספר הזה עבר אליכם מהקורא/ת הקודם/ת. דיווח על נזק יגיע גם ל${owner}, הבעלים, שלא היו במסירה.`
				: `This book was passed to you by the previous reader. A damage report also reaches ${owner}, who owns it and was not at the handover.`,
		contactAsYou: (email: string) =>
			he ? `נשיב לכתובת ${email}.` : `We will answer at ${email}.`,
		awayShelf: (date: string) =>
			he
				? `אתם בחופשה עד ${date}. אי אפשר לבקש את הספרים שלכם עד אז.`
				: `You are away until ${date}. Nobody can ask for your books until then.`,
		remindersRan: (summary: string) => {
			const [sent = "0", escalated = "0"] = summary.split(" ");
			return he
				? `נשלחו ${sent} תזכורות, ${escalated} הועברו למודרטורים.`
				: `Sent ${sent} reminders, escalated ${escalated}.`;
		},
		coversTaken: (summary: string) => {
			const [taken = "0", failed = "0"] = summary.split(" ");
			return he
				? `${taken} כריכות הועתקו אלינו, ${failed} נכשלו.`
				: `Took in ${taken} covers, ${failed} could not be fetched.`;
		},
		connectedOn: (date: string) =>
			he ? `חובר ב־${date}` : `Connected ${date}`,
		lastUsed: (date: string) =>
			he ? `שימוש אחרון ${date}` : `last used ${date}`,
		periodName: (p: string) =>
			({
				morning: he ? "בוקר" : "morning",
				afternoon: he ? "צהריים" : "afternoon",
				evening: he ? "ערב" : "evening",
			})[p] ?? p,
		weekdayName: (d: number) =>
			dateFormat(locale, { weekday: "short" }).format(
				new Date(Date.UTC(2024, 0, 7 + d)),
			),
		heldFor: (until: string) =>
			he
				? `שמור לחבר/ה מהרשימה עד ${until}`
				: `Held for someone on the waitlist until ${until}`,
		offerHeld: (until: string) =>
			he
				? `עותק שמור לכם עד ${until}.`
				: `A copy is held for you until ${until}.`,
		waitlistPosition: (n: number) =>
			he ? `מקום ${n} בתור` : `position ${n} in the queue`,
		relayVia: (name: string) =>
			he ? `מסירה מ־\u2068${name}\u2069` : `handed on by \u2068${name}\u2069`,
		photoNumber: (n: number) => (he ? `תמונה ${n}` : `Photo ${n}`),
		/** The suggested colours' names, as Flat UI gives them in English. */
		accentName: (id: SuggestedAccent) =>
			(he
				? {
						"green-sea": "ים ירוק",
						nephritis: "נפריט",
						"belize-hole": "החור של בליז",
						wisteria: "ויסטריה",
						"midnight-blue": "כחול חצות",
						orange: "כתום",
						pumpkin: "דלעת",
						pomegranate: "רימון",
						silver: "כסף",
						asbestos: "אסבסט",
					}
				: {
						"green-sea": "Green Sea",
						nephritis: "Nephritis",
						"belize-hole": "Belize Hole",
						wisteria: "Wisteria",
						"midnight-blue": "Midnight Blue",
						orange: "Orange",
						pumpkin: "Pumpkin",
						pomegranate: "Pomegranate",
						silver: "Silver",
						asbestos: "Asbestos",
					})[id],
		/** What a connected assistant can and cannot do, for the connect page. */
		assistantCan: he
			? [
					"לחפש בקטלוג ולראות מה זמין לידכם",
					"לרשום ספרים משלכם, כולל צילום כריכה",
					"לבקש ספר, לאשר או לדחות בקשות, לשלוח הודעות בהשאלה",
					"להזכיר בעדינות (פעם ביום)",
					"למודרטורים: לתקן כל ספר ואת הכריכה שלו, ולנהל את אוצר התגיות",
				]
			: [
					"Search the catalogue and see what is available near you",
					"List your own books, cover photo included",
					"Request a book, answer requests, message on a loan",
					"Send a gentle reminder (once a day)",
					"For moderators: correct any book and its cover, and keep the tag vocabulary",
				],
		assistantCannot: he
			? [
					"לסמן מסירה או החזרה, זה נעשה ביד",
					"לראות כתובות או אימיילים של חברים אחרים",
				]
			: [
					"Mark a handoff or a return: that is done by hand",
					"See other members' addresses or emails",
				],
		memberStatusName: (status: string) =>
			(he
				? {
						active: "פעיל/ה",
						suspended: "מושעה/ית",
						pending: "ממתין/ה",
						left: "עזב/ה",
					}
				: {
						active: "Active",
						suspended: "Suspended",
						pending: "Pending",
						left: "Left",
					})[status] ?? status,
		/** Who has the book from whom, in words: an arrow does not turn in Hebrew. */
		loanParties: (borrower: string, lender: string) =>
			he
				? `\u2068${borrower}\u2069 שואל/ת מ־\u2068${lender}\u2069`
				: `\u2068${borrower}\u2069 borrowing from \u2068${lender}\u2069`,
		relayHandover: (holder: string, borrower: string) =>
			he
				? `⁨${holder}⁩ מעביר/ה ישירות ל־⁨${borrower}⁩, ושניהם קובעים ביניהם מתי.`
				: `⁨${holder}⁩ hands it straight to ⁨${borrower}⁩; the two of them arrange when.`,
		webhooksReplay: (url: string) =>
			he
				? `החמצתם משהו? ${url} מחזיר את האירועים מאז מזהה נתון.`
				: `Missed some? ${url} replays events after a given id.`,
		webhookPingFailed: (code: string) =>
			he
				? `הפינג נכשל${code && code !== "0" ? ` (HTTP ${code})` : ""}.`
				: `Ping failed${code && code !== "0" ? ` (HTTP ${code})` : ""}.`,
		webhookLast: (status: number | null, at: number, loc: string) =>
			`${he ? "אחרון" : "last"} ${status ?? "—"} ${dateFormat(loc === "he" ? "he-IL" : "en-GB", { dateStyle: "short", timeStyle: "short" }).format(at * 1000)}`,
		addedCount: (n: number) =>
			he ? `${n} נוספו הפעם` : `${n} added this session`,
		addedCopy: (title: string) =>
			he ? `«${title}» נוסף למדף שלך.` : `“${title}” is on your shelf.`,
		waitingCount: (n: number) =>
			he
				? `${n} ${plural(n, "שכן/ה מחכה", "שכנים מחכים")}`
				: `${n} ${plural(n, "neighbour is", "neighbours are")} waiting`,
		teaserCounts: (copies: number, waiting: number) =>
			he
				? `${copies} ${plural(copies, "עותק", "עותקים")} בקהילה · ${waiting} ${plural(waiting, "ממתין/ה", "ממתינים")}`
				: `${copies} ${plural(copies, "copy", "copies")} in the community · ${waiting} waiting`,
		requestHeld: (name: string, minutes: number) =>
			he
				? `הבקשה תגיע אל ${name} בעוד ${minutes} ${plural(minutes, "דקה", "דקות")}. ביטול לפני כן, והיא לא תגיע בכלל.`
				: `${name} hears about it in ${minutes} ${plural(minutes, "minute", "minutes")}. Cancel before then and they never will.`,
		tooManyLinks: (minutes: number) =>
			he
				? `נשלחו כבר כמה קישורי כניסה. בדקו את תיבת הדואר (גם בספאם) ונסו שוב בעוד ${minutes} ${plural(minutes, "דקה", "דקות")}.`
				: `Several sign-in links have gone out already. Check your inbox, including spam, and try again in ${minutes} ${plural(minutes, "minute", "minutes")}.`,
		copiesBadge: (total: number, available: number, mine: boolean) => {
			if (total === 1 && mine) return he ? "שלכם" : "yours";
			if (available === 0) return he ? "מושאל" : "all out";
			if (total === 1) return he ? "זמין" : "available";
			return he
				? `${available} מתוך ${total} זמינים`
				: `${available} of ${total} free`;
		},
		andOthers: (n: number) => (he ? `ועוד ${n}` : `and ${n} more`),
		placeMissingVisitor: (name: string) =>
			he
				? `עוד לא צוין מקום מפגש. שאלו את \u2068${name}\u2069 בהודעות.`
				: `\u2068${name}\u2069 has not said where to meet yet. Ask in the messages.`,
		/** How it works, in three lines. */
		startHow: (he
			? [
					["רושמים ספרים", "הם נשארים אצלכם."],
					["מבקשים משכנים", "כל ספר בסביבה."],
					["נפגשים ומחליפים", "במועד ששניכם בחרתם."],
				]
			: [
					["List your books", "They stay on your shelf."],
					["Ask a neighbour", "For any book nearby."],
					["Meet and swap", "At a time you both picked."],
				]) as [string, string][],
		setupStepOf: (n: number, of: number) =>
			he ? `שלב ${n} מתוך ${of}` : `Step ${n} of ${of}`,
		withinKm: (km: number) => (he ? `עד ${km} ק״מ` : `Up to ${km} km`),
		booksTotal: (n: number) =>
			he
				? n === 1
					? "ספר אחד"
					: `${n} ספרים`
				: `${n} ${plural(n, "book", "books")}`,
		copiesSummary: (total: number, free: number) =>
			he
				? `${total} ${plural(total, "עותק", "עותקים")}, ${free} ${plural(free, "זמין", "זמינים")}`
				: `${total} ${plural(total, "copy", "copies")}, ${free} free`,
		myLoanBadge: (status: "requested" | "accepted" | "active") =>
			he
				? { requested: "ביקשתם", accepted: "אושר לכם", active: "אצלכם" }[status]
				: { requested: "you asked", accepted: "agreed", active: "with you" }[
						status
					],
		withYou: (due: string | null) =>
			he
				? due
					? `אצלכם עד ${due}.`
					: "אצלכם עכשיו."
				: due
					? `With you, due back ${due}.`
					: "With you now.",
		// Sent by an assistant for someone: said on the message, to both sides.
		sentVia: (client: string) =>
			he ? `נשלח דרך \u2068${client}\u2069` : `sent via \u2068${client}\u2069`,
		madeVia: (client: string) =>
			he ? `דרך \u2068${client}\u2069` : `via \u2068${client}\u2069`,
		actionsFor: (name: string) =>
			he
				? `פעולות עבור \u2068${name}\u2069`
				: `Actions for \u2068${name}\u2069`,
		mergeKeeping: (title: string) =>
			he ? `איחוד תחת «${title}»` : `Merge, keep “${title}”`,
		inviteWaiting: (days: number) =>
			he
				? `ממתינה \u00b7 פגה בעוד ${days} ${plural(days, "יום", "ימים")}`
				: `waiting \u00b7 expires in ${days} ${plural(days, "day", "days")}`,
		inviteMessage: (community: string) =>
			he
				? `אני בספרייה השכונתית של ${community} — משאילים ספרים בין שכנים. מצטרפים כאן:`
				: `I am in the ${community} neighbourhood library — neighbours lending each other books. Join here:`,
		startTitle: (community: string) =>
			he ? `ברוכים הבאים ל${community}` : `Welcome to ${community}`,
		youReported: (kind: string) =>
			he
				? `דיווחת למודרטורים: ${kind}`
				: `You reported this to the moderators: ${kind}`,
		reportedBy: (name: string, kind: string) =>
			he ? `דיווח של ${name}: ${kind}` : `${name} reported: ${kind}`,
		calendarTitle: (direction: "out" | "back", book: string, other: string) =>
			direction === "out"
				? he
					? `מסירת «${book}» – ${other}`
					: `Handing over “${book}” – ${other}`
				: he
					? `החזרת «${book}» – ${other}`
					: `Returning “${book}” – ${other}`,
		memberLoanCounts: (borrowed: number, lent: number, open: number) =>
			he
				? `שאלו ${borrowed} · השאילו ${lent} · פתוחות ${open}`
				: `${borrowed} borrowed · ${lent} lent · ${open} open`,
		inviteLinkFacts: (by: string, on: string, uses: number, max: number) =>
			he
				? `בקישור של ${by} מ־${on}, שנוצל ${uses} מתוך ${max}`
				: `on a link ${by} made on ${on}, used ${uses} of ${max}`,
		taggingPosition: (n: number, total: number) =>
			he ? `${n} מתוך ${total}` : `${n} of ${total}`,
		taggingNewValue: (group: string) =>
			he ? `+ ${group} חדש/ה` : `+ new ${group.toLowerCase()}`,
		taggingMissing: (group: string) =>
			he ? `בלי ${group}` : `No ${group.toLowerCase()}`,
		taggingMissingDone: (group: string) =>
			he
				? `לא נשאר כלום בלי ${group}.`
				: `Nothing left without ${group.toLowerCase()}.`,
		unread: (n: number) => (he ? (n === 1 ? "חדש" : `${n} חדשים`) : `${n} new`),
		contactTopicName: (topic: string) =>
			({
				feedback: he ? "משוב" : "Feedback",
				data: he ? "בקשת מידע" : "Data request",
				complaint: he ? "תלונה" : "Complaint",
			})[topic] ?? topic,
		adminMessagesHandled: (on: string) =>
			he ? `טופל ב־${on} ·` : `Handled on ${on} ·`,
		pageOf: (page: number, pages: number) =>
			he ? `עמוד ${page} מתוך ${pages}` : `Page ${page} of ${pages}`,
		logAction: (action: string) => {
			const names: Record<string, [string, string]> = {
				"POST /v1/admin/members/:id/role": ["Changed a role", "שינוי תפקיד"],
				"POST /v1/admin/members/:id/status": [
					"Changed a member's status",
					"שינוי מצב חבר/ה",
				],
				"POST /v1/admin/members/:id/invites/revoke": [
					"Revoked a member's invites",
					"ביטול הזמנות של חבר/ה",
				],
				"POST /v1/admin/members/:id/export": [
					"Exported a member's data",
					"ייצוא המידע של חבר/ה",
				],
				"POST /v1/admin/members/:id/erase": ["Deleted a member", "מחיקת חבר/ה"],
				"POST /v1/admin/copies/:id/retire": [
					"Took a copy off the shelves",
					"הורדת עותק מהמדפים",
				],
				"POST /v1/admin/invites": ["Made an invite link", "יצירת קישור הזמנה"],
				"POST /v1/admin/invites/:id/revoke": [
					"Revoked an invite link",
					"ביטול קישור הזמנה",
				],
				"PATCH /v1/admin/works/:id": ["Corrected a book", "תיקון פרטי ספר"],
				"POST /v1/works/:id/merge": [
					"Merged a book into another",
					"איחוד ספרים",
				],
				"PUT /v1/works/:id/tags": ["Tagged a book", "תיוג ספר"],
				"POST /v1/admin/reports/:id/:action": [
					"Closed a report",
					"סגירת דיווח",
				],
				"POST /v1/admin/reports/:id/replies": [
					"Wrote to a reporter",
					"כתיבה למדווח/ת",
				],
				"POST /v1/admin/tags": ["Added a tag", "הוספת תגית"],
				"PATCH /v1/admin/tags/:slug": ["Edited a tag", "עריכת תגית"],
				"DELETE /v1/admin/tags/:slug": ["Removed a tag", "הסרת תגית"],
				"PATCH /v1/admin/tag-namespaces/:id": [
					"Renamed a tag group",
					"שינוי שם קבוצת תגיות",
				],
				"POST /v1/admin/tag-proposals/:id/approve": [
					"Approved a tag suggestion",
					"אישור הצעת תגית",
				],
				"POST /v1/admin/tag-proposals/:id/decline": [
					"Declined a tag suggestion",
					"דחיית הצעת תגית",
				],
				"POST /v1/admin/contact/:id/:action": [
					"Handled a message",
					"טיפול בהודעה",
				],
				"PATCH /v1/admin/settings": [
					"Changed the library's settings",
					"שינוי הגדרות הספרייה",
				],
				"POST /v1/admin/backup": ["Took a backup", "גיבוי"],
				"POST /v1/admin/covers/rehost": [
					"Took in outside covers",
					"העברת כריכות",
				],
				"POST /v1/admin/reminders/run": ["Ran the reminders", "הרצת תזכורות"],
			};
			const name = names[action];
			return name ? name[he ? 1 : 0] : action;
		},
		openInviteLine: (made: string, until: string, uses: number, max: number) =>
			he
				? `נוצר ב־${made}, בתוקף עד ${until}, נוצל ${uses} מתוך ${max}`
				: `Made ${made}, open until ${until}, used ${uses} of ${max}`,
		eraseConfirm: (name: string) =>
			he
				? `כדי לאשר, הקלידו את השם: ${name}`
				: `To confirm, type their name: ${name}`,
		dataRequestsLine: (open: number, days: number) =>
			he
				? `${open} ממתינות; הוותיקה בת ${days} ימים. יש חודש לענות.`
				: `${open} waiting; the oldest is ${days} days old. There is a month to answer.`,
		writeToReporter: (name: string) =>
			he ? `כתיבה אל ${name}` : `Write to ${name}`,
		reportKindName: (k: string) =>
			({
				damage: he ? "נזק" : "Damage",
				loss: he ? "אובדן" : "Lost",
				no_show: he ? "לא הגיע/ה" : "No-show",
				conduct: he ? "התנהגות" : "Conduct",
				other: he ? "אחר" : "Other",
			})[k] ?? k,
		reportStatusName: (status: string) =>
			({
				open: he ? "פתוח" : "Open",
				resolved: he ? "טופל" : "Resolved",
				dismissed: he ? "נדחה" : "Dismissed",
			})[status] ?? status,
		reportedAgo: (d: number) =>
			he
				? `דווח לפני ${d} ${plural(d, "יום", "ימים")}`
				: `reported ${d} ${plural(d, "day", "days")} ago`,
		handedOn: (date: string) =>
			he ? `נמסר ב־${date}` : `Handed over on ${date}`,
		dueOn: (date: string) => (he ? `להחזרה עד ${date}` : `due ${date}`),
		returnedOn: (date: string) =>
			he ? `הוחזר ב־${date}` : `Returned on ${date}`,
		resultsFor: (q: string) =>
			he ? `תוצאות עבור „${q}”` : `Results for “${q}”`,
		booksFrom: (name: string) =>
			name
				? he
					? `ספרים של ${name}`
					: `Books from ${name}`
				: he
					? "ספרים של חבר/ה בקהילה"
					: "Books from this member",
		otherBooksFrom: (name: string) =>
			he ? `עוד ספרים של ${name}` : `More books from ${name}`,
		pages: (n: number) => (he ? `${n} עמודים` : `${n} pages`),
		removeFilters: (n: number) =>
			he
				? n === 1
					? "הסרת הסינון"
					: "הסרת המסננים"
				: n === 1
					? "Remove filter"
					: "Remove filters",
		conditionName: (c: string) => conditions[c] ?? c,
		stateName: (s: string) => states[s] ?? s,
		loanStatus: (s: string) => loanStatuses[s] ?? s,
	};
}

export type Strings = Dictionary & ReturnType<typeof helpers>;

/**
 * Every word on screen, in the reader's language and the library's type: a
 * library of things lays its words (i18n-things.ts) over the book words.
 */
export function strings(locale: Locale): Strings {
	const base = { ...dictionary[locale], ...helpers(locale) };
	if (libraryType() !== "things") return base;
	const stateName = (s: string) =>
		(thingStates[locale] as Record<string, string>)[s] ?? base.stateName(s);
	return {
		...base,
		...thingWords[locale],
		...thingHelpers(locale),
		stateName,
	} as Strings;
}

/** Distances and numbers go through Intl, never string concatenation. */
export function formatDistance(
	locale: Locale,
	metres: number | null,
): string | null {
	if (metres === null) return null;
	const formatter = new Intl.NumberFormat(locale, {
		style: "unit",
		unit: metres >= 1000 ? "kilometer" : "meter",
		maximumFractionDigits: metres >= 1000 ? 1 : 0,
	});
	return formatter.format(metres >= 1000 ? metres / 1000 : metres);
}
