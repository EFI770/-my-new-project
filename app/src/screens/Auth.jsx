import React, { useState } from 'react';
import { api, heError } from '../api.js';
import { useApp } from '../App.jsx';

export default function AuthScreen() {
  const { refreshMe, showToast, navigate } = useApp();
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register({ email, password, displayName });
        showToast('נרשמת בהצלחה! השלם את פרופיל הלימוד');
      } else {
        await api.login({ email, password });
        showToast('ברוך הבא');
      }
      await refreshMe();
      navigate('find');
    } catch (err) {
      setError(heError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-[380px] px-5">
      <header className="pt-5">
        <button onClick={() => navigate('')} className="text-[13px] text-ink-2">← חזרה</button>
        <div className="pt-4 text-[20px] font-bold text-green-dark">חברותא</div>
        <div className="text-[13px] text-ink-2">הצטרפות לקהילת הלומדים ברתמים</div>
      </header>

      <div className="pt-5 text-[12px] leading-6 text-ink-2">
        המערכת שומרת על פרטיותך: פרטי קשר נחשפים רק לאחר אישור הדדי.
        מבוגרים בלבד בפיילוט.
      </div>

      <div className="mt-5 grid grid-cols-2 rounded-full bg-cream-2 p-1">
        {[['login', 'התחברות'], ['register', 'הרשמה']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setMode(k); setError(null); }}
            className={`rounded-full py-2 text-[14px] ${mode === k ? 'bg-white font-semibold text-green-dark shadow-sm' : 'text-ink-2'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4 pt-6">
        {mode === 'register' && (
          <label className="block">
            <span className="text-[13px] font-medium text-ink">שם תצוגה</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="למשל: יעקב כהן"
              className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]"
              required
              maxLength={80}
            />
          </label>
        )}
        <label className="block">
          <span className="text-[13px] font-medium text-ink">אימייל</span>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px] text-left"
            required
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-ink">סיסמה</span>
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px] text-left"
            required
            minLength={mode === 'register' ? 8 : 1}
          />
          {mode === 'register' && <span className="text-[11px] text-ink-2">לפחות 8 תווים</span>}
        </label>
        {error && <div className="rounded-xl bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-green-dark py-3 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'רגע…' : mode === 'register' ? 'הרשמה' : 'התחברות'}
        </button>
      </form>
    </div>
  );
}
