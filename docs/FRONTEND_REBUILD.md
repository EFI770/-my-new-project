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
- `supabase/migrations/0003_private_interests_and_contact_disclosure.sql` — DRAFT:
  בחירות עניין פרטיות (RLS, הצופה בלבד), טבלת אמצעי קשר נפרדת (בעלים בלבד),
  `list_my_matches()` (התאמה הדדית בלבד), `get_connection_contact()` (חשיפת קשר רק
  לאחר בקשה מאושרת + שתי הסכמות + ללא חסימה; fail-closed).

## בדיקות ביצוע (לא מוקים)
- `scripts/test-db-local.sh` — 18/18: מדיניות RLS של 0001+0002 מול Postgres אמיתי.
- `scripts/test-db-0003-local.sh` — 18/18: פרטיות בחירות, שער חשיפת קשר, חסימות מול Postgres אמיתי.
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
4. 0003 הוא DRAFT ודורש סקירה לפני החלה על פרויקט אמיתי.
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
