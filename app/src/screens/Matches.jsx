import {AvailabilityFields, AvailabilitySummary} from '../StudyAvailability.jsx';
import {cleanStudyAvailability} from '../availability.js';
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { errText, useLang, useLabels } from '../i18n.jsx';
import { useApp } from '../App.jsx';

export default function Matches() {
  const { showToast, navigate } = useApp();
  const { t } = useLang();
  const labels = useLabels();
  const [matches, setMatches] = useState(null);
  const [messageFor, setMessageFor] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    try { setMatches((await api.matches()).matches); }
    catch (err) { showToast(errText(t, err)); }
  }
  useEffect(() => { load(); }, []);

  async function sendRequest(candidateId) {
    try {
      await api.createConnection({ recipientId: candidateId, message });
      showToast(t('toastConnSent'));
      setMessageFor(null);
      setMessage('');
      navigate('connections');
    } catch (err) { showToast(errText(t, err)); }
  }

  if (matches === null) return <div className="pt-5 text-ink-2">{t('loading')}</div>;
  if (matches.length === 0) {
    return (
      <div className="pt-8 text-center text-[14px] leading-7 text-ink-2">
        {t('noMatches')}
      </div>
    );
  }
  return (
    <div className="grid gap-4 pt-5 md:grid-cols-2">
      {matches.map((m) => (
        <div key={m.candidateId} className="rounded-[20px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <div className="text-[13px] font-medium text-green-mid">{t('mutualMatch')}</div>
          <div className="pt-1 text-[16px] font-semibold text-green-dark">{m.card?.displayName || t('fallbackName')}</div>
          {m.card?.bio && <div className="pt-1 text-[13px] text-ink-2">{m.card.bio}</div>}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {(m.card?.learningTopics || []).map((topic) => (
              <span key={topic} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-green-dark">{labels.topic(topic)}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[12px] text-ink-2">
            {m.card?.learningLevel && <span>{labels.level(m.card.learningLevel)}</span>}
            {(m.card?.preferredModes || []).length > 0 && <span>{m.card.preferredModes.map((x) => labels.mode(x)).join(' • ')}</span>}
            {(m.card?.availableDays || []).length > 0 && <span>{t('daysPrefix')} {m.card.availableDays.map((d) => labels.day(d)).join(' ')}</span>}
          </div>
          <AvailabilitySummary windows={m.card?.availableWindows} duration={m.card?.studyDurationMinutes}/>
          {messageFor === m.candidateId ? (
            <div className="pt-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('openingLine')}
                maxLength={1000}
                className="w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2.5 text-[14px]"
                rows={2}
              />
              <div className="flex gap-2 pt-2">
                <button onClick={() => sendRequest(m.candidateId)} className="flex-1 rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">{t('sendConnection')}</button>
                <button onClick={() => setMessageFor(null)} className="rounded-full border border-[#e7e5e4] bg-white px-4 py-2.5 text-[14px] text-ink-2">{t('cancel')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setMessageFor(m.candidateId)} className="mt-4 w-full rounded-full bg-green-dark py-2.5 text-[14px] font-medium text-white">
              {t('sendConnection')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
