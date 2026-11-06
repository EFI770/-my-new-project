import React, { useEffect, useState } from 'react';
import { api, heError } from '../api.js';
import { useApp } from '../App.jsx';
import { STATUS_HE, CONTACT_KINDS } from '../labels.js';

export default function Connections() {
  const { showToast } = useApp();
  const [connections, setConnections] = useState(null);
  const [contactFor, setContactFor] = useState({}); // id -> methods[] | 'denied'

  async function load() {
    try { setConnections((await api.connections()).connections); }
    catch (err) { showToast(heError(err)); }
  }
  useEffect(() => { load(); }, []);

  async function act(fn, okText) {
    try { await fn(); showToast(okText); await load(); }
    catch (err) { showToast(heError(err)); }
  }

  async function revealContact(id) {
    try {
      const { contactMethods } = await api.contact(id);
      setContactFor((s) => ({ ...s, [id]: contactMethods }));
    } catch {
      setContactFor((s) => ({ ...s, [id]: 'denied' }));
    }
  }

  if (connections === null) return <div className="pt-2 text-ink-2">טוען…</div>;
  if (connections.length === 0) {
    return <div className="pt-8 text-center text-[14px] text-ink-2">אין בקשות חיבור עדיין.</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {connections.map((c) => {
        const contact = contactFor[c.id];
        return (
          <div key={c.id} className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold text-green-dark">{c.otherName || 'משתמש'}</div>
              <span className="rounded-full bg-cream-2 px-2.5 py-1 text-[11px] text-ink-2">
                {c.direction === 'incoming' ? 'נכנסת' : 'יוצאת'} • {STATUS_HE[c.status]}
              </span>
            </div>
            {c.message && <div className="pt-2 text-[13px] leading-6 text-ink-2">{c.message}</div>}

            {c.status === 'pending' && c.direction === 'incoming' && (
              <div className="flex gap-2 pt-4">
                <button onClick={() => act(() => api.respond(c.id, 'accepted'), 'הבקשה אושרה')} className="flex-1 rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">אישור</button>
                <button onClick={() => act(() => api.respond(c.id, 'declined'), 'הבקשה נדחתה')} className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2.5 text-[14px] text-ink-2">דחייה</button>
              </div>
            )}
            {c.status === 'pending' && c.direction === 'outgoing' && (
              <button onClick={() => act(() => api.respond(c.id, 'cancelled'), 'הבקשה בוטלה')} className="mt-4 w-full rounded-full border border-[#e7e5e4] bg-white py-2.5 text-[14px] text-ink-2">
                ביטול הבקשה
              </button>
            )}

            {c.status === 'accepted' && (
              <div className="pt-4">
                <label className="flex items-center gap-2.5 rounded-xl bg-cream-2/60 px-4 py-3 text-[13px]">
                  <input
                    type="checkbox"
                    checked={c.myConsent}
                    onChange={(e) => act(() => api.consent(c.id, e.target.checked), e.target.checked ? 'הסכמת לשיתוף פרטי קשר' : 'ההסכמה בוטלה')}
                  />
                  אני מסכים/ה לשתף את פרטי הקשר שלי עם {c.otherName || 'הצד השני'}
                </label>
                <div className="pt-3">
                  {c.myConsent && c.theirConsent ? (
                    contact === undefined ? (
                      <button onClick={() => revealContact(c.id)} className="w-full rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">
                        הצגת פרטי קשר
                      </button>
                    ) : contact === 'denied' ? (
                      <div className="text-center text-[13px] text-ink-2">פרטי הקשר אינם זמינים</div>
                    ) : contact.length === 0 ? (
                      <div className="text-center text-[13px] text-ink-2">הצד השני עוד לא הוסיף פרטי קשר באזור האישי</div>
                    ) : (
                      <div className="space-y-2">
                        {contact.map((m) => (
                          <div key={m.kind + m.value} className="flex items-center justify-between rounded-xl bg-[#f0fdf4] px-4 py-3">
                            <span className="text-[13px] text-green-dark">{CONTACT_KINDS[m.kind]}</span>
                            <span dir="ltr" className="text-[14px] font-medium">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="text-center text-[12px] leading-5 text-ink-2">
                      פרטי קשר יחשפו רק לאחר ששני הצדדים יסכימו לשיתוף
                      {c.myConsent && !c.theirConsent ? ' (ממתין לצד השני)' : ''}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
