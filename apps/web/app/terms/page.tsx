import { cookies } from "next/headers";
import { strings, type Locale } from "../../lib/i18n.ts";
import { PageHead } from "../ui.tsx";
import { contactAddress, operator } from "../../lib/operator.ts";
import { libraryType } from "../../lib/library-type.ts";
import { forThings } from "../../lib/legal-things.ts";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.terms);

/** Decision 0009: peer-to-peer, plain language, no liability taken on. */
export default async function TermsPage() {
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const contact = contactAddress();
	const operatorName = await operator(locale);
	const written =
		locale === "he"
			? [
					[
						"מה זה",
						"ספרייה שכונתית. חברים משאילים זה לזה ספרים שבבעלותם. האתר רק רושם: מי מציע מה, מי ביקש, מי אישר, ומי מחזיק ספר כרגע.",
					],
					[
						"מי מפעיל את זה",
						`${operatorName} מפעילים את הספרייה, בלי תאגיד ובלי מטרת רווח. לכל שאלה — על התנאים, על המידע שלכם, או כדי לבקש הסרה של משהו — כתבו אל ${contact}. אנחנו עונים לבני אדם, לא למערכת תמיכה, אז תנו לנו כמה ימים.`,
					],
					[
						"מי יכול להצטרף",
						"חברים בני 18 ומעלה, בהזמנה מחבר קיים. אין חשבונות לילדים: הורה רושם ספרי ילדים ומבקש אותם בשם המשפחה, ואחראי למה שקורה סביב זה. חשבון של מי שאינו בן 18 ייסגר.",
					],
					[
						"הספרים באחריותכם",
						"הספרים הם שלכם, והם נשארים באחריותכם. האתר אינו צד להשאלה, אינו מבטיח שספר יוחזר, ואינו אחראי במאום לספרים עצמם — לאובדן, לנזק, לגניבה, לאיחור או למצב שבו הספר חוזר. מי שמשאיל ספר עושה זאת על אחריותו בלבד. אם משהו קורה, הסדירו את זה ביניכם; המודרטורים יכולים לעזור, לא לפסוק ולא לפצות.",
					],
					[
						"בין שכנים",
						"כל השאלה היא הסכם ישיר בין שני חברים. האתר רק רושם מה סוכם.",
					],
					[
						"המפגש עצמו",
						"את מקום המפגש והשעה אתם קובעים בעצמכם. בחרו מקום שנוח לכם — רבים מעדיפים מקום ציבורי, ואף אחד לא חייב למסור כתובת פרטית. הספרייה אינה נוכחת במפגש, אינה בודקת מי החברים מעבר להזמנה, ואינה אחראית למה שקורה שם. השתמשו בשיקול דעת, כפי שהייתם עושים עם כל שכן.",
					],
					[
						"בלי כסף",
						"אין תשלום, אין פיקדון, אין קנסות. מי שמבקש תשלום עבור השאלה מפר את התנאים.",
					],
					[
						"מה נשמר",
						`אימייל, שם תצוגה, אזור מקורב (כ־300 מטר) שמוצג לשאר החברים, מקום המפגש שכתבתם בעצמכם — אם זו הכתובת שלכם, זו הכתובת שנשמרת — הספרים שרשמתם, וההודעות בכל השאלה. מקום המפגש נחשף רק לצד השני של ההשאלה, ורק אחרי ששניכם אישרתם מועד. הודעות נמחקות 90 יום אחרי שההשאלה נסגרת. אפשר לבקש מחיקת חשבון בכל עת; ספרי עבר נשמרים בלי שם. הפירוט המלא — מה נשמר, למי זה מגיע ולכמה זמן — נמצא בעמוד הפרטיות.`,
					],
					[
						"עוגיות",
						"עוגיות, כולן שלנו: מה שמחבר אתכם, והעדפות קטנות כמו השפה שבה אתם קוראים. אין מעקב, אין אנליטיקס ואין פרסום — ולכן גם אין מה לאשר או לסרב. בעמודים עם מפה, אריחי המפה נטענים מ־OpenStreetMap, כך שהשרת שלהם רואה שביקשתם אותם.",
					],
					[
						"כריכות ותוכן",
						`הספרים, הכריכות וההערות מגיעים מהחברים או ממאגרי ספרים ציבוריים. אנחנו שומרים עותק של הכריכה אצלנו כדי שהעמוד לא יפנה לשרת של מישהו אחר. אם אתם בעלי הזכויות בתמונה או בטקסט ואינכם רוצים שיופיעו כאן — כתבו אל ${contact} ונסיר.`,
					],
					[
						"התנהגות",
						"היו הוגנים ונחמדים. דיווח על בעיה בהשאלה פותח את השיחה בפני המודרטורים, כדי שיוכלו להכריע. המודרטורים יכולים להשעות חשבון או לסגור אותו, למשל על הטרדה, על שימוש בספרייה למסחר, או על חשבון שאינו של אדם אמיתי מהקהילה. חשבון סגור מאבד גישה לקטלוג ולהודעות.",
					],
					[
						"בלי הבטחות על השירות",
						"הספרייה ניתנת כמות שהיא. אנחנו לא מבטיחים שהאתר יהיה זמין, שהודעה תגיע בזמן, או שמידע לא יאבד, ואנחנו יכולים לשנות אותו או לסגור אותו. שום דבר כאן אינו מגביל אחריות למוות או לנזק גוף שנגרמו ברשלנות, או למרמה — דברים שהחוק אינו מאפשר להגביל. מעבר לכך, ובמידה שהחוק מתיר, איננו אחראים לנזק שנגרם משימוש בספרייה.",
					],
					[
						"דין וסמכות",
						"התנאים האלה כפופים לדין אנגליה וויילס, ולבתי המשפט שם.",
					],
					[
						"שינויים",
						"התנאים עשויים להתעדכן לפני פתיחת הספרייה לקהילות נוספות. שינוי מהותי יישלח באימייל.",
					],
				]
			: [
					[
						"What this is",
						"A neighbourhood library. Members lend each other books they own. The site only keeps the record: who offers what, who asked, who agreed, and who holds a book right now.",
					],
					[
						"Who runs it",
						`${operatorName} run the library. There is no company behind it and nobody makes money from it. For anything at all — these terms, your data, or asking for something to be taken down — write to ${contact}. You are writing to a person rather than a support desk, so allow a few days.`,
					],
					[
						"Who can join",
						"Members aged 18 or over, invited by a member. There are no accounts for children: a parent lists and borrows children's books for the family and stays responsible for what happens around that. An account held by someone under 18 will be closed.",
					],
					[
						"The books are your own",
						"Your books stay your responsibility. This site is not a party to a loan, does not guarantee a book comes back, and takes no responsibility whatsoever for the books themselves — for loss, damage, theft, delay, or the state a book comes back in. Lending is at the owner's own risk. If something happens, settle it between you. Moderators can help; they do not rule and they do not compensate.",
					],
					[
						"Between neighbours",
						"Every loan is a direct agreement between two members. The site only records what was agreed.",
					],
					[
						"Meeting in person",
						"You arrange the time and place yourselves. Pick somewhere you are comfortable — many people prefer a public spot, and nobody has to give out a home address. The library is not present at a handover, does not check members beyond the invitation that brought them in, and is not responsible for what happens there. Use the judgement you would use with any neighbour.",
					],
					[
						"No money",
						"No fees, no deposits, no fines. Asking for payment for a loan breaks these terms.",
					],
					[
						"What we keep",
						"Your email, a display name, a rough area (about 300 m) that other members see, the meeting place you write yourself — if that is your address, then that is what is stored — the books you list, and the messages on each loan. A meeting place is shown only to the other side of a loan, and only once you have both agreed a time. Messages are deleted 90 days after a loan closes. You can ask for your account to be deleted at any time; past loans are kept without your name. The full account — what is kept, who it reaches, and for how long — is on the privacy page.",
					],
					[
						"Cookies",
						"Cookies, all of them ours: what signs you in, and small preferences such as the language you read in. No tracking, no analytics, no advertising — which is why there is nothing here to accept or refuse. On pages with a map, the map tiles come from OpenStreetMap, so their server sees that you asked for them.",
					],
					[
						"Covers and content",
						`Books, covers and notes come from members or from public book databases. We keep our own copy of a cover so that a page here does not point at somebody else's server. If you hold the rights to an image or a piece of text and would rather it were not here, write to ${contact} and it goes.`,
					],
					[
						"Conduct",
						"Be fair and be kind. Reporting a problem on a loan opens that conversation to the moderators, so they can settle it. Moderators can suspend or close an account — for harassment, for using the library to trade, or for an account that is not a real person from this community. A closed account loses access to the catalogue and to its messages.",
					],
					[
						"No promises about the service",
						"The library is provided as it is. We do not promise it will be available, that a notification will arrive in time, or that nothing will ever be lost, and we may change it or close it. Nothing here limits liability for death or personal injury caused by negligence, or for fraud — the law does not allow that to be limited. Beyond that, and as far as the law allows, we are not liable for any loss arising from your use of the library.",
					],
					[
						"Law",
						"These terms are governed by the law of England and Wales, and its courts.",
					],
					[
						"Changes",
						"These terms may change before the library opens to more communities. A material change goes out by email.",
					],
				];
	// A library of things says the same of things (lib/legal-things.ts).
	const sections =
		libraryType() === "things"
			? written.map(([heading, body]) => [
					forThings(heading ?? ""),
					forThings(body ?? ""),
				])
			: written;
	return (
		<main className="narrow" style={{ maxInlineSize: "40rem" }}>
			<PageHead title={t.terms} />
			{sections.map(([heading, body]) => (
				<section key={heading}>
					<h2>{heading}</h2>
					<p>{body}</p>
				</section>
			))}
			<p>
				<a href="/privacy">{t.privacy}</a>
			</p>
			<p className="muted">{t.termsVersion}</p>
		</main>
	);
}
