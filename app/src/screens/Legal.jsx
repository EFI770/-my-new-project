// Public legal pages (privacy policy + accessibility statement).
// Hebrew is the controlling version; the English section is a mirror.
// Blanks marked [יושלם לפני ההשקה] / [TO FILL BEFORE LAUNCH] are owner
// decisions; the pages must not ship to the public with blanks in them.
// Draft facts distinguish the deployed synthetic preview from the planned Firebase pilot.

function Shell({ titleHe, titleEn, children }) {
  return (
    <div className="mx-auto max-w-[760px] px-5 py-8">
      <a href="#/" className="text-[13px] text-green-dark underline">→ חזרה לאפליקציה · Back to the app</a>
      <h1 className="pt-4 text-[24px] font-bold text-green-dark">{titleHe}</h1>
      <div className="text-[14px] text-ink-2">{titleEn}</div>
      <p role="note" className="mt-4 rounded-xl bg-amber-100 p-4 text-sm text-amber-900">טיוטה לבדיקה בלבד, לא נוסח סופי לפרסום. פרטי המפעיל והמדיניות עדיין טעונים השלמה ואישור. · Draft for review only, not a final published policy. Operator details and policy decisions still need confirmation.</p>
      <div className="grid gap-6 pt-6">{children}</div>
    </div>
  );
}

function Section({ he, en }) {
  return (
    <section className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
      <div dir="rtl" className="text-right">{he}</div>
      <hr className="my-4 border-[#f0efe9]" />
      <div dir="ltr" className="text-left text-[13px] leading-6 text-ink-2">{en}</div>
    </section>
  );
}

function H({ children }) {
  return <h2 className="pb-2 text-[16px] font-semibold text-green-dark">{children}</h2>;
}

function P({ children }) {
  return <p className="pb-2 text-[14px] leading-6">{children}</p>;
}

// Owner-decision blank, highlighted so it cannot ship unnoticed.
function Blank({ children }) {
  return <mark className="rounded bg-amber-100 px-1 font-semibold text-amber-900">{children}</mark>;
}

export function Privacy() {
  return (
    <Shell titleHe="מדיניות פרטיות - חברותא" titleEn="Privacy Policy - Chavruta · Last updated: November 2026">
      <Section
        he={<>
          <H>1. מי אנחנו ומהי האפליקציה</H>
          <P>חברותא היא אפליקציה קהילתית להתאמת בני/בנות זוג ללימוד (חברותא). האפליקציה פועלת כפיילוט קהילתי, ללא תשלום.</P>
          <P>מפעיל האתר והאחראי על המידע: <Blank>[יושלם לפני ההשקה: שם המפעיל, יישוב וכתובת דוא"ל לפניות פרטיות]</Blank></P>
        </>}
        en={<>
          <H>1. Who we are</H>
          <P>Chavruta is a community app that matches study partners (chavruta). It runs as a free community pilot.</P>
          <P>Site operator and data controller: <Blank>[TO FILL BEFORE LAUNCH: operator name, locality, privacy contact email]</Blank></P>
        </>}
      />
      <Section
        he={<>
          <H>2. איזה מידע נאסף</H>
          <P><b>פרטי זיהוי:</b> כתובת הדוא"ל שלך. עם הרשמה דרך Google - גם שם ותמונת פרופיל בסיסיים מחשבון Google שלך, בהסכמתך במסך של Google.</P>
          <P><b>פרופיל לימוד:</b> שם תצוגה, מגדר (לצורך הפרדת התאמות בלבד, לפי כללי המיזם), תחומי לימוד, רמה, ימים ואופן לימוד מועדף.</P>
          <P><b>פעילות באפליקציה:</b> בקשות לימוד, אישורים ודחיות, והסכמות לחשיפת פרטי קשר.</P>
          <P><b>פרטי קשר שתבחרי/תבחר לשתף</b> (למשל טלפון) - נחשפים לצד השני רק לאחר הסכמה הדדית של שני הצדדים.</P>
          <P><b>מה לא נאסף:</b> אין גישה ל-Gmail, ל-Drive או לאנשי הקשר שלך. אין פרסומות. נכון לגרסה הנוכחית לא מוטמעים כלי מדידה (analytics) באפליקציה.</P>
        </>}
        en={<>
          <H>2. What we collect</H>
          <P><b>Identity:</b> your email address. With Google sign-in - also your basic Google profile name and picture, with your consent on Google's screen.</P>
          <P><b>Learning profile:</b> display name, gender (used only for matching separation, per the project's rules), learning topics, level, preferred days and mode.</P>
          <P><b>App activity:</b> study requests, approvals and declines, and consents to share contact details.</P>
          <P><b>Contact details you choose to share</b> (e.g. phone) - revealed to the other side only after mutual consent by both sides.</P>
          <P><b>Not collected:</b> no access to Gmail, Drive or contacts. No ads. The current version embeds no analytics tools.</P>
        </>}
      />
      <Section
        he={<>
          <H>3. למה משמש המידע</H>
          <P>התאמת חברותא, הפעלת האפליקציה, אבטחת החשבון ומילוי בקשותיך (כולל מחיקה). המידע לא יימכר ולא ישותף לצורכי שיווק.</P>
        </>}
        en={<>
          <H>3. How we use it</H>
          <P>Matching study partners, operating the app, account security, and fulfilling your requests (including deletion). Data is never sold or shared for marketing.</P>
        </>}
      />
      <Section
        he={<>
          <H>4. מי רואה מה</H>
          <P>פרופיל הלימוד גלוי רק למשתמשים רשומים מאותה קבוצת התאמה; ההפרדה נאכפת ברמת מסד הנתונים עצמו.</P>
          <P>פרטי הקשר אינם מוצגים בפרופיל ואינם גלויים לאף משתמש. הם נחשפים לצד השני רק לאחר ששני הצדדים אישרו.</P>
          <P>למפעיל האתר ולבעלי תפקידים מטעמו (כולל סייענים טכניים וספקי אחסון) עשויה להיות גישה טכנית למסד הנתונים לצורך תפעול ותחזוקה בלבד.</P>
        </>}
        en={<>
          <H>4. Who sees what</H>
          <P>Your learning profile is visible only to registered users in your own matching group; separation is enforced at the database level.</P>
          <P>Contact details are not shown in the profile and are not visible to any user. They are revealed to the other side only after both sides approve.</P>
          <P>The site operator and persons acting on their behalf (including technical assistants and hosting providers) may have technical access to the database for operation and maintenance only.</P>
        </>}
      />
      <Section
        he={<>
          <H>5. היכן המידע נשמר ומי מעבד אותו</H>
          <P>מסד נתוני האפליקציה מופעל על ידי Neon באזור מזרח ארה"ב. האתר מוגש דרך Cloudflare. בתצוגת הדמו נעשה שימוש במשתמשים סינתטיים בלבד. לפיילוט עם משתמשים אמיתיים נבחר Firebase Authentication לצורך כניסה דרך Google; החיבור בפועל טרם אומת. המידע עשוי להיות מעובד מחוץ לישראל; מיקומי העיבוד ותקופות השמירה אצל הספקים טעונים אימות לפני ההשקה.</P>
          <P>בעת הרשמה דרך Google, Google מעבדת את ההזדהות בהתאם למדיניות הפרטיות שלה.</P>
          <P>ההרשמה המתוכננת היא דרך Google בלבד, ללא סיסמה נפרדת לאפליקציה. שליחת דוא"ל מתוך האפליקציה כבויה בתצוגה המקדימה. אין שליחת דוא"ל שיווקי.</P>
        </>}
        en={<>
          <H>5. Where data is stored and who processes it</H>
          <P>The app database is hosted by Neon in the US East region. Cloudflare serves the website. The demo uses synthetic users only. Firebase Authentication has been selected for Google sign-in in the real-user pilot; the live connection has not yet been verified. Data may be processed outside Israel; provider processing locations and retention periods need verification before launch.</P>
          <P>When you sign up with Google, Google processes the authentication under its own privacy policy.</P>
          <P>The planned sign-in method is Google only, with no separate app password. Email sending from the app is disabled in the preview. No marketing email is sent.</P>
        </>}
      />
      <Section
        he={<>
          <H>6. שמירת מידע ומחיקה</H>
          <P>המידע נשמר כל עוד החשבון פעיל. ניתן למחוק את החשבון בכל עת מתוך האפליקציה (מסך הפרופיל). המחיקה מסירה מיידית את פרופיל הלימוד, נתוני ההתאמה ופרטי הקשר. מחיקת רשומת הזהות אצל ספק הכניסה (Google דרך Firebase) מתבצעת כחלק מתהליך המחיקה באפליקציה; אם היא לא הושלמה, תוצע אפשרות לנסות שוב או לפנות למפעיל להסרה. לאחר מחיקה נשמר מזהה טכני בלבד של רשומת הכניסה (ללא פרופיל וללא אימייל) כדי למנוע פתיחה מחדש אוטומטית של חשבון שנמחק; המפעיל מוחק מזהה זה לפי בקשה. ייתכן שעותקים יישארו לזמן מה בגיבויים וביומני מערכת אצל ספק הענן, עד להחלפתם ומחיקתם לפי מדיניות הספק; טווח הזמן המדויק לכך טרם אומת.</P>
        </>}
        en={<>
          <H>6. Retention and deletion</H>
          <P>Data is kept while your account is active. You can delete your account at any time from within the app (profile screen). Deletion immediately removes the learning profile, matching data, and contact details. Removing the identity record at the sign-in provider (Google via Firebase) runs as part of in-app deletion; if it does not complete, you can retry or ask the operator to remove it. After deletion we retain only a technical identifier of the sign-in record (no profile, no email) to prevent automatic re-creation of a deleted account; the operator removes this identifier on request. Copies may persist for a limited time in the cloud provider's backups and system logs until they roll over and are deleted per the provider's policy; the exact timeframe has not yet been verified.</P>
        </>}
      />
      <Section
        he={<>
          <H>7. אבטחה</H>
          <P>חיבור מוצפן (TLS), בידוד בין משתמשים הנאכף ברמת מסד הנתונים (נבדק בבדיקות אוטומטיות), והרשאות גישה מדורגות. בהרשמה דרך Google האפליקציה אינה שומרת סיסמאות כלל. אין מערכת מאובטחת במאה אחוז.</P>
        </>}
        en={<>
          <H>7. Security</H>
          <P>Encrypted connections (TLS), user isolation enforced at the database level (covered by automated tests), and tiered access permissions. With Google sign-in the app stores no passwords at all. No system is 100% secure.</P>
        </>}
      />
      <Section
        he={<>
          <H>8. גיל</H>
          <P>השימוש מותר לבני 18 ומעלה בלבד. בעת ההרשמה תתבקש/י לאשר שאת/ה בן/בת 18 ומעלה.</P>
        </>}
        en={<>
          <H>8. Age</H>
          <P>The app is for adults aged 18 and over only. At sign-up you will be asked to confirm you are 18 or over.</P>
        </>}
      />
      <Section
        he={<>
          <H>9. זכויותיך, שינויים ויצירת קשר</H>
          <P>בכפוף לחוק הגנת הפרטיות, התשמ"א-1981, יש לך זכות לעיין במידע שנשמר עליך, לבקש תיקונו או מחיקתו. חלק מהפעולות זמינות ישירות באפליקציה (עריכת פרופיל, מחיקת חשבון).</P>
          <P>שינוי מהותי במדיניות יפורסם באפליקציה לפני כניסתו לתוקף.</P>
          <P>לפניות בנושא פרטיות: <Blank>[יושלם לפני ההשקה: כתובת דוא"ל לפניות]</Blank></P>
        </>}
        en={<>
          <H>9. Your rights, changes, and contact</H>
          <P>Under Israel's Privacy Protection Law, 1981, you have the right to review data held about you and to request its correction or deletion. Some actions are available directly in the app (edit profile, delete account).</P>
          <P>Material changes to this policy will be posted in the app before taking effect.</P>
          <P>Privacy inquiries: <Blank>[TO FILL BEFORE LAUNCH: contact email]</Blank></P>
        </>}
      />
    </Shell>
  );
}

export function Accessibility() {
  return (
    <Shell titleHe="הצהרת נגישות - חברותא" titleEn="Accessibility Statement - Chavruta · Last updated: November 2026">
      <Section
        he={<>
          <H>המחויבות שלנו</H>
          <P>אנו פועלים להנגשת האפליקציה בהתאם לתקן הישראלי ת"י 5568 (המבוסס על WCAG 2.0 ברמה AA), ובוחנים גם קריטריונים מ-WCAG 2.2 ברמה AA. הנגישות היא חלק מתכנון המערכת, לא תוספת חיצונית.</P>
        </>}
        en={<>
          <H>Our commitment</H>
          <P>We work to make the app accessible per Israeli Standard 5568 (based on WCAG 2.0 level AA), and also consider WCAG 2.2 level AA criteria. Accessibility is built into the product, not bolted on.</P>
        </>}
      />
      <Section
        he={<>
          <H>התאמות שיושמו</H>
          <P>האפליקציה כוללת קישור "דלג לתוכן", תמיכה ב-RTL וב-LTR, כותרות ואזורי תוכן סמנטיים, סימון העמוד הפעיל בתפריט, הודעות מערכת לקוראי מסך וטפסים עם תוויות בעברית ובאנגלית. התאמות אלה אינן אישור לעמידה מלאה בתקן; נדרשות בדיקות נוספות לפני ההשקה.</P>
        </>}
        en={<>
          <H>Adjustments implemented</H>
          <P>The app includes a "skip to content" link, RTL and LTR support, semantic headings and landmarks, current-page marking in the menu, screen-reader status messages, and forms with Hebrew and English labels. These adjustments do not establish full compliance; more testing is needed before launch.</P>
        </>}
      />
      <Section
        he={<>
          <H>בדיקות שבוצעו</H>
          <P>ב-7 בנובמבר 2026 נבדקו מסכי המועמדים המעודכנים בעברית ברוחב 320 ו-390 פיקסל ובמחשב, ובאנגלית ברוחב 390 פיקסל ובמחשב. בסריקת axe-core לקריטריוני WCAG 2.0/2.1 ברמות A ו-AA לא נמצאו הפרות במסכים אלה. נבדקו גם גלילה ומיקוד כך שכפתור הבחירה אינו מוסתר בתפריט התחתון. זו אינה בדיקה מלאה של כל מסכי הגרסה הנוכחית.</P>
          <P>שימו לב: בדיקות אוטומטיות אינן מכסות את כל קריטריוני התקן. טרם בוצעה בדיקת נגישות מקצועית מלאה (ידנית) על ידי מומחה נגישות מוסמך.</P>
        </>}
        en={<>
          <H>Testing performed</H>
          <P>On November 7, 2026, the updated candidate screens were tested in Hebrew at 320px, 390px, and desktop widths, and in English at 390px and desktop widths. An axe-core scan for WCAG 2.0/2.1 levels A and AA found no violations on those screens. Scrolling and focus were also checked so the selection button is not hidden behind the bottom menu. This is not a full audit of every screen in the current build.</P>
          <P>Note: automated checks do not cover every criterion of the standard. A full professional (manual) accessibility audit by a certified expert has not yet been performed.</P>
        </>}
      />
      <Section
        he={<>
          <H>מגבלות ידועות</H>
          <P>הבדיקות המתוארות לעיל מוגבלות למסכים ולתנאים שנבדקו. טרם נבדקה מקלדת iOS אמיתית, וטרם בוצעה בדיקה ידנית מקצועית מלאה. אם נתקלתם בבעיה, פנו בערוץ הקשר שיושלם לפני ההשקה.</P>
        </>}
        en={<>
          <H>Known limitations</H>
          <P>The checks above cover only the screens and conditions tested. An actual iOS keyboard has not yet been tested, and a full professional manual audit has not been performed. Please report problems through the contact channel to be completed before launch.</P>
        </>}
      />
      <Section
        he={<>
          <H>יצירת קשר בנושא נגישות</H>
          <P>נתקלתם בבעיית נגישות? פנו אלינו ונטפל: <Blank>[יושלם לפני ההשקה: ערוץ פנייה בנושא נגישות]</Blank></P>
          <P>הצורך במינוי רכז נגישות ותחולת החובות המשפטיות ייבדקו לפני ההשקה. לא נקבעה בטיוטה זו זכאות לפטור.</P>
        </>}
        en={<>
          <H>Accessibility contact</H>
          <P>Encountered an accessibility problem? Contact us and we will handle it: <Blank>[TO FILL BEFORE LAUNCH: accessibility contact channel]</Blank></P>
          <P>The need for an accessibility coordinator and the applicable legal duties will be checked before launch. This draft does not establish an exemption.</P>
        </>}
      />
    </Shell>
  );
}
