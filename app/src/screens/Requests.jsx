import React, { useEffect, useState } from 'react';
import { api, heError } from '../api.js';
import { useApp } from '../App.jsx';
import { TOPICS, LEVELS, MODES, DAYS, STATUS_HE } from '../labels.js';

const EMPTY_FORM = { title: '', topic: '', description: '', learningLevel: '', preferredModes: [], availableDays: [] };

export default function Requests() {
  const { showToast, navigate } = useApp();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(null); // null | {..EMPTY_FORM, id?}
  const [messageFor, setMessageFor] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    try { setItems((await api.studyRequests()).studyRequests); }
    catch (err) { showToast(heError(err)); }
  }
  useEffect(() => { load(); }, []);

  function toggle(list, v) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function save() {
    try {
      if (form.id) {
        await api.updateStudyRequest(form.id, { title: form.title, description: form.description, topic: form.topic });
        showToast('הבקשה עודכנה');
      } else {
        await api.createStudyRequest({
          title: form.title, topic: form.topic, description: form.description,
          learningLevel: form.learningLevel || null,
          preferredModes: form.preferredModes, availableDays: form.availableDays,
        });
        showToast('הבקשה פורסמה');
      }
      setForm(null);
      await load();
    } catch (err) { showToast(heError(err)); }
  }

  async function setStatus(id, status) {
    try { await api.updateStudyRequest(id, { status }); await load(); }
    catch (err) { showToast(heError(err)); }
  }

  async function connect(item) {
    try {
      await api.createConnection({ recipientId: item.ownerId, studyRequestId: item.id, message });
      showToast('בקשת החיבור נשלחה');
      setMessageFor(null); setMessage('');
      navigate('connections');
    } catch (err) { showToast(heError(err)); }
  }

  if (form) {
    return (
      <div className="mx-auto max-w-[560px]">
        <button onClick={() => setForm(null)} className="text-[13px] text-ink-2">← חזרה</button>
        <h2 className="pt-3 text-[18px] font-bold text-green-dark">{form.id ? 'עריכת בקשה' : 'פרסום בקשת חברותא'}</h2>
        <div className="space-y-4 pt-4">
          <label className="block">
            <span className="text-[13px] font-medium">כותרת</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120}
              placeholder="למשל: חברותא בבבא קמא פרק ב" className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]" />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">נושא</span>
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {TOPICS.map((t) => (
                <button key={t} type="button" onClick={() => setForm({ ...form, topic: t })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${form.topic === t ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{t}</button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">תיאור (לא חובה)</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000}
              className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]" />
          </label>
          <div>
            <span className="text-[13px] font-medium">רמה</span>
            <div className="flex gap-1.5 pt-1.5">
              {Object.entries(LEVELS).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, learningLevel: k })}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] ${form.learningLevel === k ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[13px] font-medium">אופן לימוד</span>
            <div className="flex gap-1.5 pt-1.5">
              {Object.entries(MODES).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, preferredModes: toggle(form.preferredModes, k) })}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] ${form.preferredModes.includes(k) ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[13px] font-medium">ימים</span>
            <div className="flex gap-1.5 pt-1.5">
              {Object.entries(DAYS).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, availableDays: toggle(form.availableDays, k) })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${form.availableDays.includes(k) ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{label}</button>
              ))}
            </div>
          </div>
          <button onClick={save} disabled={!form.title.trim() || !form.topic}
            className="w-full rounded-full bg-green-dark py-3 text-[15px] font-semibold text-white disabled:opacity-50">
            {form.id ? 'שמירה' : 'פרסום'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-green-dark">בקשות לימוד פתוחות</h2>
        <button onClick={() => setForm({ ...EMPTY_FORM })} className="rounded-full bg-green-dark px-4 py-2 text-[13px] font-medium text-white">
          + פרסום בקשה
        </button>
      </div>
      {items === null && <div className="pt-4 text-ink-2">טוען…</div>}
      {items !== null && items.length === 0 && <div className="pt-8 text-center text-[14px] text-ink-2">אין בקשות פתוחות עדיין.</div>}
      <div className="grid gap-4 pt-4 md:grid-cols-2">
        {(items || []).map((s) => (
          <div key={s.id} className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold text-green-dark">{s.title}</div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] ${s.status === 'open' ? 'bg-[#f0fdf4] text-green-dark' : 'bg-cream-2 text-ink-2'}`}>{STATUS_HE[s.status]}</span>
            </div>
            <div className="pt-1 text-[12px] text-ink-2">{s.ownerName}{s.mine ? ' (שלי)' : ''} • {s.topic}{s.learningLevel ? ` • ${LEVELS[s.learningLevel]}` : ''}</div>
            {s.description && <div className="pt-2 text-[13px] leading-6 text-ink-2">{s.description}</div>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[12px] text-ink-2">
              {(s.preferredModes || []).length > 0 && <span>{s.preferredModes.map((m) => MODES[m]).join(' • ')}</span>}
              {(s.availableDays || []).length > 0 && <span>ימים: {s.availableDays.map((d) => DAYS[d]).join(' ')}</span>}
            </div>
            {s.mine ? (
              <div className="flex gap-2 pt-4">
                <button onClick={() => setForm({ ...EMPTY_FORM, id: s.id, title: s.title, topic: s.topic, description: s.description, learningLevel: s.learningLevel || '', preferredModes: s.preferredModes || [], availableDays: s.availableDays || [] })}
                  className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2 text-[13px]">עריכה</button>
                {s.status === 'open'
                  ? <button onClick={() => setStatus(s.id, 'paused')} className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2 text-[13px]">השהיה</button>
                  : <button onClick={() => setStatus(s.id, 'open')} className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2 text-[13px]">פתיחה מחדש</button>}
                <button onClick={() => setStatus(s.id, 'closed')} className="flex-1 rounded-full border border-[#fecaca] bg-white py-2 text-[13px] text-danger">סגירה</button>
              </div>
            ) : messageFor === s.id ? (
              <div className="pt-3">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={1000}
                  placeholder="משפט קצר (לא חובה)" className="w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2.5 text-[14px]" />
                <div className="flex gap-2 pt-2">
                  <button onClick={() => connect(s)} className="flex-1 rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">שליחת בקשת חיבור</button>
                  <button onClick={() => setMessageFor(null)} className="rounded-full border border-[#e7e5e4] bg-white px-4 py-2.5 text-[14px] text-ink-2">ביטול</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setMessageFor(s.id)} className="mt-4 w-full rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">
                בקשת חיבור
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
