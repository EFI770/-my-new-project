# חברותא — בנייה מחדש של שכבת האינטראקציה (ענף פיתוח בלבד)

**סטטוס:** ענף פיתוח `dev/frontend-rebuild`. לא פורסם, לא מחובר לספק ענן, לא למשתמשים אמיתיים.

## ארכיטקטורה
- `app/` — קוד מקור חדש של הממשק: React 18 + Vite + Tailwind. עברית RTL, מערכת העיצוב
  (צבעים, גופנים, שפה חזותית) והתוכן נשמרו מהאפליקציה הקיימת. כל גישה לשרת עוברת דרך
  `app/src/api.js` בלבד — כשייבחר ספק (Supabase או אחר), מחליפים רק את שכבת התעבורה.
- `server/` — **אמולטור פיתוח בלבד, אינו רכיב ייצור.** מגיש את הממשק ומממש API שבו כל
  בקשה מתבצעת תחת מדיניות ה-RLS וה-RPCs האמיתיים מהמיגרציות (role `authenticated` +
  `app.sub` לכל בקשה, כמו PostgREST). אין בו שום החלטת הרשאה משלו.
- `server/devAuth.js` — אימות פיתוח זמני (אימייל+סיסמה, scrypt) עד לבחירת ספק אימות.
  **אין אימות בעלות על אימייל** — פער ידוע; ייפתח עם ספק האימות.
- `supabase/migrations/0004_gender_separation.sql` — DRAFT: הפרדת מינים מחייבת
  (הוראת בעל המוצר בווטסאפ, 2026-11-06): מין מוצהר בהרשמה (גבר/אישה), האכיפה
  בשכבת מסד הנתונים — פרופילים, בקשות לימוד, בחירות עניין, התאמות, בקשות חיבור
  וחשיפת קשר מוגבלים כולם לבני אותו מין. מין חסר נכשל סגור (לא רואה אף אחד
  ואף אחד לא רואה אותו). מין קבוע לאחר ההרשמה (זמני — ראה סעיף 6 בפערים):
  טריגר דוחה כל שינוי של מין קיים בכל נתיב עדכון, כך שלא יכול להיווצר קשר
  בין-מיני דרך עריכת פרופיל, בלי ליישם כלל הרסני שלא אושר.
- `supabase/migrations/0003_private_interests_and_contact_disclosure.sql` — DRAFT:
  בחירות עניין פרטיות (RLS, הצופה בלבד), טבלת אמצעי קשר נפרדת (בעלים בלבד),
  `list_my_matches()` (התאמה הדדית בלבד), `get_connection_contact()` (חשיפת קשר רק
  לאחר בקשה מאושרת + שתי הסכמות + ללא חסימה; fail-closed).

## בדיקות ביצוע (לא מוקים)
- `scripts/test-db-local.sh` — 18/18: מדיניות RLS של 0001+0002 מול Postgres אמיתי.
- `scripts/test-db-0003-local.sh` — 18/18: פרטיות בחירות, שער חשיפת קשר, חסימות מול Postgres אמיתי.
- `scripts/test-db-0004-local.sh` — 26/26: הפרדת מינים — נראות חד-מינית, דחיית
  בחירות/חיבורים בין-מיניים, כשל-סגור ללא מין, ניתוק מלא בעת שינוי מין, חשיפת
  קשר חד-מינית בלבד — מול Postgres אמיתי.
- `scripts/test-api-local.sh` — 50/50: בדיקות HTTP מקצה-לקצה דרך האמולטור מול RLS אמיתי
  (אימות, פרופיל, מועמדים ללא שדות קשר, עניין חד-צדדי לא נחשף, בקשות לימוד, חיבורים,
  הסכמה דו-צדדית, חשיפת קשר, חסימות, דיווחים, התנתקות).
- `server/harness/visual-check.mjs` — 11/11: נהיגה בדפדפן Chromium אמיתי דרך כל הזרימה
  בממשק (נחיתה → הרשמה → פרופיל → מועמדים → בחירה פרטית → התאמה → חיבור → הסכמה →
  חשיפת קשר), כולל צילומי מסך.

## פערים ידועים (לא לפרסום בלעדיהם)
1. ספק אימות/מסד לא נבחר — האמולטור ו-devAuth הם פיתוח בלבד. אין אימות אימייל.
2. אין קונסול ניהול/מודרציה ואין מדיניות שמירת מידע מאושרת. מגביל ה-rate limiting
   באמולטור הוא לבדיקות בלבד, לא הגנת ייצור. מגבלות האימות בייצור ייבדקו מול הספק.
3. מחיקת חשבון: סמנטיקת השמירה של דיווחים (דיווחים על המשתמש נשמרים עם מזהה מנופל)
   היא **החלטת מדיניות זמנית (provisional)** — אפשרות ביצוע בלבד, לא מדיניות מאושרת.
   טעונה סקירה ואישור של אפי לפני השקה, יחד עם מדיניות שמירת מידע מלאה.
4. 0003 ו-0004 הם DRAFT ודורשים סקירה לפני החלה על פרויקט אמיתי.
5. זהות מגדרית היא הצהרתית בלבד (גבר/אישה בהרשמה) — אין אימות זהות מעבר לכך,
   בהתאם להוראה. בחירת שפת הממשק (עברית/אנגלית) נשמרת ב-localStorage בלבד
   בגרסת הפיתוח; שמירה ברמת החשבון תוחלט עם ספק האימות.
6. PROVISIONAL — מדיניות שינוי מין ממתינה להחלטת בעל המוצר. כרגע נכשל סגור:
   מין קבוע לאחר ההרשמה (מסלול היחיד לשינוי: מחיקת חשבון והרשמה מחדש).
   האפשרויות לסקירה: (א) קביעות מלאה כפי שמיושם כעת — הכי שמרני, תקלה בהרשמה
   דורשת פתיחת חשבון חדש; (ב) שינוי מותר עם ניתוק מלא של כל החיבורים,
   ההתאמות והבחירות משני הצדדים — גמיש אבל הרסני לצד השני (מנתק גם אותו בלי
   שביקש); (ג) שינוי בתיווך מנהל קהילה — מאזן, דורש לבנות זרימת מנהל.
   ההמלצה: (א) לפיילוט, ולבחון מחדש אם יוצא מקרה אמיתי.

## זרימת המוצר המאושרת (הבהרת בעל המוצר, 2026-11-06)
הרשמה עם מין -> פרופיל לימוד (מה מחפשים) -> מועמדים/התאמות גלויים באותו מין
בלבד, ללא פרטי קשר -> בקשת חיבור ללא חשיפה -> אישור החיבור נפרד מאישור
השיתוף -> רק לאחר הסכמה מפורשת של שני הצדדים פרטי הקשר נחשפים לצד השני בלבד
(לא לציבור) -> תיאום ישיר ביניהם. אישור בקשה אינו מעביר פרטי קשר; אין
הודעות אוטומטיות למשתמשים אחרים. מכוסה בבדיקות: N2b/N3/N7/N9/N11, U5,
S2b, C3, I6, V8b/V8c.
5. הבנייה (`app/dist`) לא נפרסת בשום מקום; האתר החי לא השתנה.

## מיפוי לספק עתידי (הוכחת תאימות "רק שכבת התעבורה משתנה")
כל מתודה ב-`app/src/api.js` ממופה לקריאת Supabase עתידית. ההבדלים היחידים שאינם 1:1
מסומנים ודורשים מיגרציה קטנה נוספת:

| api.js | Supabase עתידי | הערה |
|---|---|---|
| register/login/logout | auth.signUp / signInWithPassword / signOut | יצירת פרופיל אוטומטית דרך trigger על auth.users (מיגרציה קטנה) |
| me / updateProfile | from('profiles') | RLS קיים; הפרופיל נוצר ע"י trigger |
| updateContactMethods | from('contact_methods') delete+insert | RLS קיים |
| candidates | from('profiles').select(allowlist) + from('interest_selections') (שלי בלבד) | שתי קריאות, מיזוג בלקוח; RLS מסנן חסימות |
| setInterest | from('interest_selections').upsert | RLS קיים |
| matches | rpc('list_my_matches') + from('profiles') | RLS קיים |
| studyRequests | from('study_requests') עם FK נוסף owner_id->profiles(id) או view | **דרוש תוספת מיגרציה קטנה** לשם הבעלים |
| connections | from('connection_requests') + from('profiles') | RLS קיים; ה enrichment בלקוח |
| respond / consent / contact | rpc('respond_to_connection_request' / 'consent_to_contact' / 'get_connection_contact') | 1:1 |
| blocks / reports | from('user_blocks') / from('user_reports') | RLS קיים |
| deleteAccount | rpc('delete_own_account') security definer או Edge Function | **דרוש תוספת מיגרציה קטנה** |

סשנים/CSRF: ב-Supabase האימות מבוסס bearer token ולא cookie, ולכן CSRF אינו רלוונטי
שם; באמולטור נאכף SameSite=Lax + JSON-only. Rate limiting: בספק מובנה ב-Auth; באמולטור
הוטמע מגביל פיתוח (login/register) לצורך בדיקות.

## פערי אמולציה מול ספק אמיתי (לכיסוי בבדיקות ביצוע לאחר בחירת ספק)
- `app.sub` מקומי מדמה JWT claims; עדיין לא נבדק מול auth.jwt() של Supabase.
- אימות בעלות על אימייל (confirm email) לא ממומש בפיתוח.
- PostgREST pooling/limits שונים מהאמולטור.

## עובדות ספק עדכנויות (נבדק מול מקורות רשמיים, 2026-11-06)
- תוכנית Free: פרויקט מושהה אחרי 7 ימי חוסר פעילות; אימייל התראה כשבוע לפני; שחזור
  עד שנה מההשהיה. מקור: https://supabase.com/docs/guides/platform/free-project-pausing
- אימות אימייל+סיסמה: מובנה, אבל **שירות ה-SMTP המובנה אינו מתאים לייצור**: שולח רק
  לכתובות צוות מורשות מראש, מוגבל ל-2 הודעות לשעה, ללא SLA. למשתמשים אמיתיים נדרש
  ספק SMTP חיצוני (החלטה/חשבון נוסף של אפי, עלול לכלול עלות).
  מקורות: https://supabase.com/docs/guides/auth/auth-email ,
  https://supabase.com/docs/guides/auth/auth-smtp
- אזורים: אין אזור Supabase בישראל/המזרח התיכון; האזור הספציפי הקרוב ביותר המתועד הוא
  Central EU (Frankfurt, eu-central-1). בחירת אזור היא גם בחירת מיקום נתונים.
  מקור: https://supabase.com/docs/guides/platform/regions

## Real Firebase acceptance and fixture isolation, 2026-11-07

Owner-performed Google sign-in and self-registration reached the candidate
screen. Live DB verified exactly one vendor binding and matching self-declared
profile. Two live schema omissions were corrected: missing deletion tombstone
table, and Neon owner role membership lacking SET permission for atomic signup.
Migration0008 grants only downward SET capability, no automatic inheritance.

Migration0009 separates privately marked synthetic members from real members.
The four known acceptance fixtures are marked in the acceptance DB, not deleted
or relabeled as real. Existing real-to-fixture interest is retained but hidden.
New accounts default to real. RLS isolates profiles, requests, interests and
connections. Match/contact RPCs and connection mutation trigger also check
population, including security-definer respond/consent paths. No token or real
profile is needed to run the rollback-only population contract:

`TEST_DATABASE_URL=... node server/harness/live-population-check.mjs`

Live rollback checks passed: real-owner context sees only self and no fixtures;
known fixture writes/contact rejected; synthetic pair preserved; new temporary
A/B/C rows exercise same-gender visibility, private unilateral interest, mutual
match, accepted request, bilateral consent, withdrawal, third-party rejection.
All diagnostic rows and ties rolled back. These test DB policy boundaries, not
independent real Google A/B sessions or real Firebase erasure/revocation.

Public gate remains closed at this checkpoint. Operator/contact and deletion
retention/reentry facts remain provisional. Do not count owner signup acceptance
as proof of community capacity or vendor account deletion.
