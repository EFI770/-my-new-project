import {AvailabilityFields, AvailabilitySummary} from '../StudyAvailability.jsx';
import {cleanStudyAvailability} from '../availability.js';
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { errText, useLang, useLabels, TOPICS } from '../i18n.jsx';
import { useApp } from '../App.jsx';

const EMPTY_FORM = { title: '', topic: '', description: '', learningLevel: '', preferredModes: [], availableDays: [],availableWindows:[],studyDurationMinutes:null };

export default function Requests() {
  const { showToast, navigate } = useApp();
  const { t } = useLang();
  const labels = useLabels();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(null); // null | {..EMPTY_FORM, id?}
  const [messageFor, setMessageFor] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    try { setItems((await api.studyRequests()).studyRequests); }
    catch (err) { showToast(errText(t, err)); }
  }
  useEffect(() => { load(); }, []);

  function toggle(list, v) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function save() {
    try {
      if(!cleanStudyAvailability(form))throw {code:'invalid_availability'};
      if (form.id) {
        await api.updateStudyRequest(form.id, { title: form.title, description: form.description, topic: form.topic,availableDays:form.availableDays,availableWindows:form.availableWindows,studyDurationMinutes:form.studyDurationMinutes });
        showToast(t('toastReqUpdated'));
      } else {
        await api.createStudyRequest({
          title: form.title, topic: form.topic, description: form.description,
          learningLevel: form.learningLevel || null,
          preferredModes: form.preferredModes, availableDays: form.availableDays,availableWindows:form.availableWindows,studyDurationMinutes:form.studyDurationMinutes,
        });
        showToast(t('toastReqPublished'));
      }
      setForm(null);
      await load();
    } catch (err) { showToast(errText(t, err)); }
  }

  async function setStatus(id, status) {
    try { await api.updateStudyRequest(id, { status }); await load(); }
    catch (err) { showToast(errText(t, err)); }
  }

  async function connect(item) {
    try {
      await api.createConnection({ recipientId: item.ownerId, studyRequestId: item.id, message });
      showToast(t('toastConnSent'));
      setMessageFor(null); setMessage('');
      navigate('connections');
    } catch (err) { showToast(errText(t, err)); }
  }

  if (form) {
    return (
      <div className="mx-auto max-w-[560px]">
        <button onClick={() => setForm(null)} className="text-[13px] text-ink-2">{t('back')}</button>
        <h2 className="pt-3 text-[18px] font-bold text-green-dark">{form.id ? t('editRequest') : t('newRequest')}</h2>
        <div className="space-y-4 pt-4">
          <label className="block">
            <span className="text-[13px] font-medium">{t('reqTitle')}</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120}
              placeholder={t('reqTitlePlaceholder')} className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]" />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">{t('reqTopic')}</span>
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {TOPICS.map((topic) => (
                <button key={topic} type="button" onClick={() => setForm({ ...form, topic })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${form.topic === topic ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.topic(topic)}</button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">{t('reqDescription')}</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000}
              className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]" />
          </label>
          <div>
            <span className="text-[13px] font-medium">{t('reqLevel')}</span>
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {['beginner', 'intermediate', 'advanced'].map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, learningLevel: k })}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] ${form.learningLevel === k ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.level(k)}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[13px] font-medium">{t('reqModes')}</span>
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {['in_person', 'phone', 'video'].map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, preferredModes: toggle(form.preferredModes, k) })}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] ${form.preferredModes.includes(k) ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.mode(k)}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[13px] font-medium">{t('reqDays')}</span>
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, availableDays: toggle(form.availableDays, k) })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${form.availableDays.includes(k) ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white'}`}>{labels.day(k)}</button>
              ))}
            </div>
          </div>
          <AvailabilityFields value={form} onChange={setForm}/>
          <button onClick={save} disabled={!form.title.trim() || !form.topic}
            className="w-full rounded-full bg-green-dark py-3 text-[15px] font-semibold text-white disabled:opacity-50">
            {form.id ? t('save') : t('publish')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-green-dark">{t('openRequests')}</h2>
        <button onClick={() => setForm({ ...EMPTY_FORM })} className="rounded-full bg-green-dark px-4 py-2 text-[13px] font-medium text-white">
          {t('postRequest')}
        </button>
      </div>
      {items === null && <div className="pt-4 text-ink-2">{t('loading')}</div>}
      {items !== null && items.length === 0 && <div className="pt-8 text-center text-[14px] text-ink-2">{t('noRequests')}</div>}
      <div className="grid gap-4 pt-4 md:grid-cols-2">
        {(items || []).map((s) => (
          <div key={s.id} className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold text-green-dark">{s.title}</div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] ${s.status === 'open' ? 'bg-[#f0fdf4] text-green-dark' : 'bg-cream-2 text-ink-2'}`}>{labels.status(s.status)}</span>
            </div>
            <div className="pt-1 text-[12px] text-ink-2">{s.ownerName}{s.mine ? ` (${t('mine')})` : ''} • {labels.topic(s.topic)}{s.learningLevel ? ` • ${labels.level(s.learningLevel)}` : ''}</div>
            {s.description && <div className="pt-2 text-[13px] leading-6 text-ink-2">{s.description}</div>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[12px] text-ink-2">
              {(s.preferredModes || []).length > 0 && <span>{s.preferredModes.map((m) => labels.mode(m)).join(' • ')}</span>}
              {(s.availableDays || []).length > 0 && <span>{t('daysPrefix')} {s.availableDays.map((d) => labels.day(d)).join(' ')}</span>}
            </div>
            <AvailabilitySummary windows={s.availableWindows} duration={s.studyDurationMinutes}/>
            {s.mine ? (
              <div className="flex gap-2 pt-4">
                <button onClick={() => setForm({ ...EMPTY_FORM, id: s.id, title: s.title, topic: s.topic, description: s.description, learningLevel: s.learningLevel || '', preferredModes: s.preferredModes || [], availableDays: s.availableDays || [],availableWindows:s.availableWindows||[],studyDurationMinutes:s.studyDurationMinutes??null })}
                  className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2 text-[13px]">{t('edit')}</button>
                {s.status === 'open'
                  ? <button onClick={() => setStatus(s.id, 'paused')} className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2 text-[13px]">{t('pause')}</button>
                  : <button onClick={() => setStatus(s.id, 'open')} className="flex-1 rounded-full border border-[#e7e5e4] bg-white py-2 text-[13px]">{t('reopen')}</button>}
                <button onClick={() => setStatus(s.id, 'closed')} className="flex-1 rounded-full border border-[#fecaca] bg-white py-2 text-[13px] text-danger">{t('close')}</button>
              </div>
            ) : messageFor === s.id ? (
              <div className="pt-3">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={1000}
                  placeholder={t('shortMessage')} className="w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2.5 text-[14px]" />
                <div className="flex gap-2 pt-2">
                  <button onClick={() => connect(s)} className="flex-1 rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">{t('sendConnection')}</button>
                  <button onClick={() => setMessageFor(null)} className="rounded-full border border-[#e7e5e4] bg-white px-4 py-2.5 text-[14px] text-ink-2">{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setMessageFor(s.id)} className="mt-4 w-full rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">
                {t('requestConnection')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
