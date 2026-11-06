import React from 'react';
import { useApp } from '../App.jsx';

export default function Landing() {
  const { navigate } = useApp();
  return (
    <div className="mx-auto min-h-screen max-w-[920px] px-5">
      <header className="flex items-center justify-between pt-5">
        <div>
          <div className="text-[20px] font-bold text-green-dark">חברותא</div>
          <div className="text-[12px] text-ink-2">רתמים • פיילוט קהילתי</div>
        </div>
        <button
          onClick={() => navigate('auth')}
          className="rounded-full bg-green-dark px-5 py-2.5 text-[14px] font-medium text-white"
        >
          התחברות / הרשמה
        </button>
      </header>

      <section className="pt-14 text-center">
        <div className="text-[13px] text-ink-2">פיילוט קהילתי בכפר רתמים</div>
        <h1 className="pt-3 text-[36px] font-bold leading-[0.95] tracking-tight text-green-dark md:text-[52px]">
          מחברים בין אנשים.
          <br />
          מתחברים לתורה.
        </h1>
        <p className="mx-auto max-w-[52ch] pt-5 text-[15px] leading-7 text-ink-2">
          חברותא היא פלטפורמה קהילתית שמחברת בין תושבי רתמים ללימוד משותף. בוחרים נושא,
          רמה וזמנים — המערכת מציעה התאמות, ובקשת חיבור נשלחת רק בהסכמה. פרטי הקשר
          נחשפים רק לאחר אישור הדדי של שני הצדדים.
        </p>
        <div className="flex justify-center gap-3 pt-7">
          <button
            onClick={() => navigate('auth')}
            className="rounded-full bg-green-dark px-6 py-3 text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(27,67,50,0.2)]"
          >
            הצטרפות לפיילוט
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5 pt-6 text-[12px] text-ink-2">
          <span className="rounded-full border border-[#e7e5d4] bg-white px-3 py-1.5">פרטיות מובנית</span>
          <span className="rounded-full border border-[#e7e5d4] bg-white px-3 py-1.5">קהילתי, ללא פרסומות</span>
          <span className="rounded-full border border-[#e7e5d4] bg-white px-3 py-1.5">רתמים + לימוד מרחוק</span>
        </div>
      </section>

      <section className="grid gap-4 pt-14 md:grid-cols-3">
        {[
          ['יוצרים פרופיל לימוד', 'בוחרים נושאים, רמה, ימים ואופן לימוד. אפשר כמה אפשרויות.'],
          ['בוחרים בפרטיות', 'הבחירה שלך נשארת פרטית. התאמה מוצגת רק כאשר שני הצדדים בחרו זה בזה.'],
          ['מאשרים ומתחילים ללמוד', 'בקשת חיבור, אישור הדדי, ורק אז חשיפת פרטי קשר שבחרתם לשתף.'],
        ].map(([title, body]) => (
          <div key={title} className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
            <div className="text-[16px] font-semibold text-green-dark">{title}</div>
            <div className="pt-2 text-[14px] leading-6 text-ink-2">{body}</div>
          </div>
        ))}
      </section>

      <footer className="py-10 text-center text-[12px] leading-6 text-ink-2">
        <div>מיזם קהילתי ללא מטרת רווח. מבוגרים בלבד בפיילוט.</div>
        <div>מדיניות פרטיות • תנאי שימוש • יצירת קשר עם מנהל הקהילה</div>
      </footer>
    </div>
  );
}
