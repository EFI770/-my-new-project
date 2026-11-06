import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { errText, useLang, useLabels, TOPICS } from '../i18n.jsx';
import { useApp } from '../App.jsx';

export default function Profile() {
  const { me, refreshMe, showToast } = useApp();
  const { t } = useLang();
  const labels = useLabels();
  const p = me.profile || {};
  const [form, setForm] = useState({
    displayName: p.display_name || '', bio: p.bio || '',
    learningTopics: p.learning_topics || [], learningLevel: p.learning_level || '',
    preferredModes: p.preferred_modes || [], availableDays: p.available_days || [],
    availabilityNotes: p.availability_notes || '',
  });
  const [methods, setMethods] = useState(me.contactMethods || []);
  const [blocks, setBlocks] = useState(null);
  const [report, setReport] = useState(null); // {reason, details, reportedUserId}
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [genderChange, setGenderChange] = useState(null); // target gender pending confirm
  useEffect(() => { api.blocks().then((r) => setBlocks(r.blocks)).catch(() => setBlocks([])); }, []);

  function toggle(list, v) { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

  async function saveProfile() {
    try {
      await api.updateProfile({
        displayName: form.displayName, bio: form.bio, learningTopics: form.learningTopics,
        learningLevel: form.learningLevel || null, preferredModes: form.preferredModes,
        availableDays: form.availableDays, availabilityNotes: form.availabilityNotes,
      });
      await refreshMe();
      showToast(t('toastProfileSaved'));
    } catch (err) { showToast(errText(t, err)); }
  }

  async function saveMethods() {
    try {
      await api.updateContactMethods(methods.map((m) => ({ kind: m.kind, value: m.value, isPrimary: m.is_primary ?? m.isPrimary ?? false })));
      await refreshMe();
      showToast(t('toastContactSaved'));
    } catch (err) { showToast(errText(t, err)); }
  }

  async function unblock(id) {
    try { await api.unblock(id); setBlocks((b) => b.filter((x) => x.blockedId !== id)); showToast(t('toastUnblocked')); }
    catch (err) { showToast(errText(t, err)); }
  }

  async function sendReport() {
    try {
      await api.report({ reportedUserId: report.reportedUserId || undefined, reason: report.reason, details: report.details });
      setReport(null);
      showToast(t('toastReported'));
    } catch (err) { showToast(errText(t, err)); }
  }

  async function deleteAccount() {
    try {
      await api.deleteAccount();
      await refreshMe();
    } catch (err) { showToast(errText(t, err)); }
  }

  async function logout() {
    await api.logout().catch(() => {});
    await refreshMe();
  }

  async function confirmGenderChange() {
    try {
      await api.updateProfile({
        displayName: form.displayName || p.display_name, bio: form.bio,
        learningTopics: form.learningTopics, learningLevel: form.learningLevel || null,
        preferredModes: form.preferredModes, availableDays: form.availableDays,
        availabilityNotes: form.availabilityNotes, gender: genderChange,
      });
      setGenderChange(null);
      await refreshMe();
      showToast(t('toastProfileSaved'));
    } catch (err) { showToast(errText(t, err)); }
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-8">
      <section>
        <h2 className="text-[18px] font-bold text-green-dark">{t('profileTitle')}</h2>
        <div className="space-y-4 pt-4">
          <label className="block">
            <span className="text-[13px] font-medium">{t('displayName')}</span>
            <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={80}
              className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]" />
          </label>
          <div>
            <span className="text-[13px] font-medium">{t('genderSection')}</span>
            <div className="mt-1.5 flex items-center gap-2">
              {['man', 'woman'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { if (g !== p.gender) setGenderChange(g); }}
                  aria-pressed={p.gender === g}
                  className={`flex-1 rounded-xl border py-2.5 text-[14px] font-medium ${
                    p.gender === g
                      ? 'border-green-dark bg-green-dark text-white'
                      : 'border-[#e7e5e4] bg-white text-ink'
                  }`}
                >
                  {labels.gender(g)}
                </button>
              ))}
            </div>
            {genderChange && (
              <div className="mt-3 rounded-[14px] border border-[#fde68a] bg-[#fffbeb] p-4">
                <div className="text-[13px] leading-6 text-[#92400e]">{t('genderChangeWarning')}</div>
                <div className="flex gap-2 pt-3">
                  <button onClick={confirmGenderChange} className="flex-1 rounded-full bg-[#b45309] py-2.5 text-[14px] font-medium text-white">
                    {t('genderChangeConfirm')}
                  </button>
                  <button onClick={() => setGenderChange(null)} className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2.5 text-[14px]">
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
          <label className="block">
            <span className="text-[13px] font-medium">{t('aboutMe')}</span>
            <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} maxLength={1000}
              placeholder={t('aboutMePlaceholder')} className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]" />
          </label>
          <div>
            <span className="text-[13px] font-medium">{t('topicsLabel')}</span>
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {TOPICS.map((topic) => (
                <button key={topic} type="button" onClick={() => setForm({ ...form, learningTopics: toggle(form.learningTopics, topic) })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${form.learningTopics.includes(topic) ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.topic(topic)}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[13px] font-medium">{t('reqLevel')}</span>
            <div className="flex gap-1.5 pt-1.5">
              {['beginner', 'intermediate', 'advanced'].map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, learningLevel: form.learningLevel === k ? '' : k })}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] ${form.learningLevel === k ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.level(k)}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[13px] font-medium">{t('reqModes')}</span>
            <div className="flex gap-1.5 pt-1.5">
              {['in_person', 'phone', 'video'].map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, preferredModes: toggle(form.preferredModes, k) })}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] ${form.preferredModes.includes(k) ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.mode(k)}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[13px] font-medium">{t('freeDays')}</span>
            <div className="flex gap-1.5 pt-1.5">
              {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, availableDays: toggle(form.availableDays, k) })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${form.availableDays.includes(k) ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.day(k)}</button>
              ))}
            </div>
          </div>
          <button onClick={saveProfile} disabled={!form.displayName.trim()}
            className="w-full rounded-full bg-green-dark py-3 text-[15px] font-semibold text-white disabled:opacity-50">
            {t('saveProfile')}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-bold text-green-dark">{t('contactTitle')}</h2>
        <p className="pt-1 text-[12px] leading-5 text-ink-2">
          {t('contactExplainer')}
        </p>
        <div className="space-y-3 pt-3">
          {methods.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={m.kind} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
                className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2.5 text-[13px]">
                {['phone', 'whatsapp', 'email', 'telegram'].map((k) => <option key={k} value={k}>{labels.contactKind(k)}</option>)}
              </select>
              <input dir="ltr" value={m.value} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                placeholder="050-1234567" className="flex-1 rounded-xl border border-[#e7e5e4] bg-white px-4 py-2.5 text-left text-[14px]" />
              <button onClick={() => setMethods(methods.filter((_, j) => j !== i))} className="text-[18px] text-ink-2">×</button>
            </div>
          ))}
          <div className="flex gap-2">
            {methods.length < 5 && (
              <button onClick={() => setMethods([...methods, { kind: 'phone', value: '', is_primary: methods.length === 0 }])}
                className="rounded-full border border-[#e7e5e4] bg-white px-4 py-2 text-[13px]">{t('addContact')}</button>
            )}
            <button onClick={saveMethods} className="rounded-full bg-green-dark px-4 py-2 text-[13px] font-medium text-white">{t('save')}</button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-bold text-green-dark">{t('blocksTitle')}</h2>
        {blocks === null && <div className="pt-2 text-ink-2">{t('loading')}</div>}
        {blocks !== null && blocks.length === 0 && <div className="pt-2 text-[13px] text-ink-2">{t('noBlocks')}</div>}
        <div className="space-y-2 pt-2">
          {(blocks || []).map((b) => (
            <div key={b.blockedId} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
              <span className="text-[13px] text-ink-2">{t('blockedUser')}</span>
              <button onClick={() => unblock(b.blockedId)} className="text-[13px] text-green-mid">{t('unblock')}</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-bold text-green-dark">{t('reportTitle')}</h2>
        {report ? (
          <div className="space-y-3 pt-3">
            <input value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })} maxLength={100}
              placeholder={t('reportReason')} className="w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[14px]" />
            <textarea value={report.details} onChange={(e) => setReport({ ...report, details: e.target.value })} rows={3} maxLength={3000}
              placeholder={t('reportDetails')} className="w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[14px]" />
            <div className="flex gap-2">
              <button onClick={sendReport} disabled={report.reason.trim().length < 3} className="flex-1 rounded-full bg-danger py-2.5 text-[14px] font-medium text-white disabled:opacity-50">{t('sendReport')}</button>
              <button onClick={() => setReport(null)} className="rounded-full border border-[#e7e5e4] bg-white px-4 py-2.5 text-[14px]">{t('cancel')}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setReport({ reason: '', details: '' })} className="mt-2 rounded-full border border-[#fecaca] bg-white px-4 py-2 text-[13px] text-danger">
            {t('reportProblem')}
          </button>
        )}
      </section>

      <section className="pb-4">
        <div className="text-[12px] text-ink-2">{t('signedInAs', { email: me.email })}</div>
        <button onClick={logout} className="mt-2 w-full rounded-full border border-[#e7e5e4] bg-white py-3 text-[14px] text-ink-2">
          {t('logout')}
        </button>
        {confirmDelete ? (
          <div className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fef2f2] p-4">
            <div className="text-[13px] leading-6 text-[#991b1b]">
              {t('deleteWarning')}
            </div>
            <div className="flex gap-2 pt-3">
              <button onClick={deleteAccount} className="flex-1 rounded-full bg-danger py-2.5 text-[14px] font-medium text-white">
                {t('deleteConfirm')}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2.5 text-[14px]">
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="mt-3 w-full text-[12px] text-ink-2 underline">
            {t('deleteAccount')}
          </button>
        )}
      </section>
    </div>
  );
}
