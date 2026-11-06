import React, { useEffect, useState } from 'react';
import { api, heError } from '../api.js';
import { useApp } from '../App.jsx';
import { LEVELS, MODES, DAYS } from '../labels.js';

export default function Matches() {
  const { showToast, navigate } = useApp();
  const [matches, setMatches] = useState(null);
  const [messageFor, setMessageFor] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    try { setMatches((await api.matches()).matches); }
    catch (err) { showToast(heError(err)); }
  }
  useEffect(() => { load(); }, []);

  async function sendRequest(candidateId) {
    try {
      await api.createConnection({ recipientId: candidateId, message });
      showToast('בקשת החיבור נשלחה');
      setMessageFor(null);
      setMessage('');
      navigate('connections');
    } catch (err) { showToast(heError(err)); }
  }

  if (matches === null) return <div className="pt-5 text-ink-2">טוען…</div>;
  if (matches.length === 0) {
    return (
      <div className="pt-8 text-center text-[14px] leading-7 text-ink-2">
        עוד אין התאמות. כשמישהו שבחרת יבחר בך חזרה — ההתאמה תופיע כאן.
      </div>
    );
  }
  return (
    <div className="grid gap-4 pt-5 md:grid-cols-2">
      {matches.map((m) => (
        <div key={m.candidateId} className="rounded-[20px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <div className="text-[13px] font-medium text-green-mid">יש התאמה הדדית ✓</div>
          <div className="pt-1 text-[16px] font-semibold text-green-dark">{m.card?.displayName || 'לומד'}</div>
          {m.card?.bio && <div className="pt-1 text-[13px] text-ink-2">{m.card.bio}</div>}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {(m.card?.learningTopics || []).map((t) => (
              <span key={t} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-green-dark">{t}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[12px] text-ink-2">
            {m.card?.learningLevel && <span>{LEVELS[m.card.learningLevel]}</span>}
            {(m.card?.preferredModes || []).length > 0 && <span>{m.card.preferredModes.map((x) => MODES[x]).join(' • ')}</span>}
            {(m.card?.availableDays || []).length > 0 && <span>ימים: {m.card.availableDays.map((d) => DAYS[d]).join(' ')}</span>}
          </div>
          {messageFor === m.candidateId ? (
            <div className="pt-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="משפט קצר לפתיחה (לא חובה)"
                maxLength={1000}
                className="w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2.5 text-[14px]"
                rows={2}
              />
              <div className="flex gap-2 pt-2">
                <button onClick={() => sendRequest(m.candidateId)} className="flex-1 rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">שליחת בקשת חיבור</button>
                <button onClick={() => setMessageFor(null)} className="rounded-full border border-[#e7e5e4] bg-white px-4 py-2.5 text-[14px] text-ink-2">ביטול</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setMessageFor(m.candidateId)} className="mt-4 w-full rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">
              שליחת בקשת חיבור
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
