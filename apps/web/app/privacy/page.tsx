import { cookies } from "next/headers";
import { strings, type Locale } from "../../lib/i18n.ts";
import { PageHead } from "../ui.tsx";
import { contactAddress, operator } from "../../lib/operator.ts";
import { libraryType } from "../../lib/library-type.ts";
import { forThings } from "../../lib/legal-things.ts";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.privacy);

/**
 * What the library holds about a member, who else ends up seeing it, and for
 * how long. Written from the tables rather than from a template: every line
 * here is something the code actually stores.
 */
export default async function PrivacyPage() {
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const contact = contactAddress();
	const operatorName = await operator(locale);
	const he = locale === "he";

	const written: [string, string[]][] = he
		? [
				[
					"מי אחראי למידע",
					[
						`${operatorName}. לכל בקשה בנוגע למידע שלכם — עותק, תיקון, מחיקה או התנגדות — כתבו אל ${contact}.`,
					],
				],
				[
					"מה נשמר",
					[
						"כתובת האימייל שלכם, שם התצוגה ושפת הקריאה.",
						"אזור מקורב, מעוגל לכ־300 מטר, שאר החברים רואים אותו כמרחק. לא הכתובת שלכם.",
						"מקום מפגש, אם כתבתם אחד. הוא נחשף רק לצד השני של השאלה, ורק אחרי ששניכם אישרתם מועד.",
						"הספרים שרשמתם: כותר, מחבר, מצב, הערות ותגיות, והכריכה אם העליתם או נמצאה.",
						"ההשאלות: מי ביקש, מי אישר, תאריכים, קודי מסירה, וההודעות בשיחה.",
						"אם אישרתם התראות — מנוי הדחיפה של הדפדפן שלכם (כתובת השירות ומפתחות ההצפנה).",
						"כניסות: קישורי כניסה חד־פעמיים, חיבורים פעילים ומועד הפעילות האחרון.",
						"אם חיברתם עוזר בינה מלאכותית — האסימון שמאפשר לו לפעול בשמכם, עד שתנתקו אותו.",
						"מונים זמניים למניעת שימוש לרעה, ובהם כתובת IP או כתובת אימייל. הם נמחקים אוטומטית כשהחלון נגמר, מדי יום.",
						"גיבוי לילי של בסיס הנתונים, נשמר 30 יום ואז נמחק.",
					],
				],
				[
					"למה זה משמש",
					[
						"להפעיל את הספרייה: להראות מי מחזיק מה, לנהל בקשות השאלה, ולשלוח את ההודעות שהן מחייבות. זה האינטרס הלגיטימי שעליו אנחנו נשענים, ובלעדיו השירות לא קיים.",
						"התראות דחיפה נשלחות רק אם ביקשתם אותן, ואפשר לבטל בכל רגע.",
						"אין פרסום, אין מכירה של מידע, ואין העברת פרטים למי שרוצה למכור לכם משהו.",
					],
				],
				[
					"מי עוד רואה את זה",
					[
						"חברים אחרים בקהילה: שם התצוגה, האזור המקורב, הספרים שרשמתם, וההודעות שאתם כותבים בהשאלה.",
						"מודרטור/ית, אם השאלה דווחה: הדיווח פותח בפניהם את השיחה שבה מדובר, כדי שיוכלו להכריע. שום דבר אחר לא פותח שיחה, והם אינם יכולים לכתוב בה.",
						"Cloudflare מאחסנת את האתר, את בסיס הנתונים ואת הכריכות, ושולחת את האימיילים, בשמנו. לכן היא רואה גם את כתובת המייל ואת תוכן ההודעה.",
						"אם אישרתם התראות — שירות הדחיפה של הדפדפן (Google, Apple או Mozilla) מעביר אותן. התוכן מוצפן עד המכשיר שלכם.",
						"בעמודים עם מפה, אריחי המפה נטענים מ־OpenStreetMap, ולכן השרת שלהם רואה את כתובת ה־IP שלכם ואיזה אזור הצגתם.",
						"כדי לתת שם לאזור שלכם, השרת שלנו שואל את postcodes.io, ומחוץ לבריטניה את Nominatim של OpenStreetMap. נשלח השם שהקלדתם או נקודה מעוגלת לכ־300 מטר, אף פעם לא אתם.",
						"בחיפוש לפי מסת״ב אנחנו שואלים את Google Books ואת Open Library. נשלח המספר בלבד, לא אתם. את תמונת הכריכה מביא השרת שלנו ושומר עותק, כך שהדפדפן שלכם לא פונה אליהם.",
						"אם חיברתם עוזר בינה מלאכותית, מה שהוא קורא מהספרייה עובר גם לספק שלו, לפי התנאים שלו.",
						"דוחות תקלה טכניים (כשלים ברשת והפרות של מדיניות האבטחה) נשלחים לשרת דיווחים שלנו. הם מכילים כתובות של עמודים ושגיאות, לא את תוכן החשבון.",
					],
				],
				[
					"כמה זמן",
					[
						"פרטי החשבון — כל עוד החשבון קיים.",
						"הודעות בשיחת השאלה — נמחקות 90 יום אחרי סגירת ההשאלה.",
						"מונים למניעת שימוש לרעה — עד יום.",
						"גיבויים — 30 יום.",
						"אחרי מחיקת חשבון נשארת רק שורת ההשאלה עצמה, בלי שם, כדי שההיסטוריה של הספר תישאר שלמה.",
					],
				],
				[
					"הזכויות שלכם",
					[
						`אתם רשאים לקבל עותק מהמידע שלכם, לתקן אותו, לבקש את מחיקתו, להתנגד לשימוש בו או לבקש אותו בפורמט נייד. כתבו אל ${contact} ונטפל בזה תוך חודש.`,
						"אם התשובה שלנו לא מספקת, אפשר להתלונן ל־Information Commissioner’s Office (ico.org.uk), הרגולטור הבריטי.",
					],
				],
				[
					"אבטחה",
					[
						"אין סיסמאות: הכניסה היא בקישור חד־פעמי לאימייל. אנחנו לא מבקשים ולא שומרים פרטי תשלום.",
						"החיבור מוצפן, והעוגייה שמחברת אתכם מוגבלת לאתר הזה בלבד.",
					],
				],
				[
					"גיל",
					[
						"החשבונות מיועדים לבני 18 ומעלה. איננו אוספים מידע על ילדים ביודעין; אם משהו כזה הגיע אלינו, כתבו ונמחק אותו.",
					],
				],
				[
					"שינויים",
					["שינוי מהותי בעמוד הזה יישלח באימייל לפני שהוא נכנס לתוקף."],
				],
			]
		: [
				[
					"Who is responsible",
					[
						`${operatorName}. For anything about your own data — a copy of it, a correction, deletion, or an objection — write to ${contact}.`,
					],
				],
				[
					"What is kept",
					[
						"Your email address, your display name, and the language you read in.",
						"A rough area, rounded to about 300 m, which other members see as a distance. Not your address.",
						"A meeting place, if you write one. It is shown only to the other side of a loan, and only once you have both agreed a time.",
						"The books you list: title, author, condition, notes and tags, and a cover if you upload one or one is found.",
						"Your loans: who asked, who agreed, the dates, the handover codes, and the messages on the thread.",
						"If you turn notifications on, your browser's push subscription — the service address and its encryption keys.",
						"Sign-in: one-shot sign-in links, your open sessions, and when you were last active.",
						"If you connect an AI assistant, the token that lets it act for you, until you disconnect it.",
						"Short-lived counters that stop abuse, holding an IP address or an email address. They are pruned automatically when the window ends, daily.",
						"A nightly snapshot of the database, kept 30 days and then deleted.",
					],
				],
				[
					"What it is used for",
					[
						"Running the library: showing who holds what, carrying loan requests, and sending the messages those need. That is the legitimate interest we rely on, and without it there is no service.",
						"Push notifications go only to people who asked for them, and can be switched off at any time.",
						"No advertising, no selling of data, and nothing passed to anybody who wants to sell you something.",
					],
				],
				[
					"Who else sees it",
					[
						"Other members of your community: your display name, your rough area, the books you list, and the messages you write on a loan.",
						"A moderator, if a loan is reported: the report opens that conversation to them, so they can settle what happened. Nothing else opens a thread, and they cannot write in it.",
						"Cloudflare hosts the site, the database and the covers, and sends the email, on our behalf. So it also sees your email address and what each message says.",
						"If you turn notifications on, your browser's push service (Google, Apple or Mozilla) carries them. The contents are encrypted as far as your device.",
						"On pages with a map, the tiles come from OpenStreetMap, so their server sees your IP address and roughly which area you looked at.",
						"To name your area, our server asks postcodes.io and, outside the UK, OpenStreetMap's Nominatim. What goes is the name you typed or a point rounded to about 300 m, never you.",
						"When you look up an ISBN we ask Google Books and Open Library. The number goes, you do not. Our own server fetches the cover image and keeps a copy, so your browser never talks to them.",
						"If you connect an AI assistant, what it reads from the library also reaches its vendor, under their terms.",
						"Technical fault reports — network failures and security-policy refusals — go to our own reporting endpoint. They carry page addresses and errors, not the contents of your account.",
					],
				],
				[
					"How long",
					[
						"Account details — for as long as the account exists.",
						"Messages on a loan thread — deleted 90 days after the loan closes.",
						"Abuse counters — up to a day.",
						"Backups — 30 days.",
						"After an account is deleted, what remains is the loan record itself, without your name, so a book's history stays whole.",
					],
				],
				[
					"Your rights",
					[
						`You can ask for a copy of your data, have it corrected, ask for it to be deleted, object to our use of it, or ask for it in a portable form. Write to ${contact} and we will deal with it within a month.`,
						"If our answer does not satisfy you, you can complain to the Information Commissioner’s Office (ico.org.uk), the UK regulator.",
					],
				],
				[
					"Security",
					[
						"There are no passwords: you sign in with a one-shot link sent to your email. We never ask for or hold payment details.",
						"The connection is encrypted, and the cookie that signs you in is scoped to this site alone.",
					],
				],
				[
					"Age",
					[
						"Accounts are for people aged 18 or over. We do not knowingly collect anything about children; if something of the sort has reached us, write and it will be deleted.",
					],
				],
				[
					"Changes",
					[
						"A material change to this page goes out by email before it takes effect.",
					],
				],
			];

	// A library of things says the same of things (lib/legal-things.ts);
	// a passage with no place there is left out.
	const sections: [string, string[]][] =
		libraryType() === "things"
			? written.map(([heading, paragraphs]) => [
					forThings(heading),
					paragraphs.map(forThings).filter(Boolean),
				])
			: written;
	return (
		<main className="narrow" style={{ maxInlineSize: "40rem" }}>
			<PageHead title={t.privacy} />
			{sections.map(([heading, paragraphs]) => (
				<section key={heading}>
					<h2>{heading}</h2>
					{paragraphs.map((paragraph) => (
						<p key={paragraph}>{paragraph}</p>
					))}
				</section>
			))}
			<p>
				<a href="/terms">{t.terms}</a>
			</p>
			<p className="muted">{t.privacyVersion}</p>
		</main>
	);
}
