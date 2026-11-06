import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { errText, useLang, useLabels, TOPICS } from '../i18n.jsx';
import { useApp } from '../App.jsx';
import Matches from './Matches.jsx';

export default function Candidates() {
  const { me, showToast } = useApp();
  const { t } = useLang();
  const labels = useLabels();
  const [sub, setSub] = useState('find'); // find | matches
  const [candidates, setCandidates] = useState(null);
  const [topicFilter, setTopicFilter] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    try {
      const { candidates } = await api.candidates();
      setCandidates(candidates);
    } catch (err) { setError(errText(t, err)); }
  }
  useEffect(() => { load(); }, []);

  const myTopics = me.profile?.learning_topics || [];
  const ranked = useMemo(() => {
    if (!candidates) return [];
    const score = (c) =>
      (c.learningTopics || []).filter((x) => myTopics.includes(x)).length * 3 +
      (c.learningLevel && c.learningLevel === me.profile?.learning_level ? 2 : 0) +
      (c.availableDays || []).filter((d) => (me.profile?.available_days || []).includes(d)).length;
    return [...candidates]
      .filter((c) => !topicFilter || (c.learningTopics || []).includes(topicFilter))
      .sort((a, b) => score(b) - score(a));
  }, [candidates, topicFilter, me]);

  async function toggleInterest(c) {
    const next = c.myInterest === true ? false : true;
    setCandidates((cs) => cs.map((x) => (x.id === c.id ? { ...x, myInterest: next } : x)));
    try {
      await api.setInterest(c.id, next);
      showToast(next ? t('toastSelected') : t('toastUnselected'));
    } catch (err) {
      setCandidates((cs) => cs.map((x) => (x.id === c.id ? { ...x, myInterest: c.myInterest } : x)));
      showToast(errText(t, err));
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 rounded-full bg-cream-2 p-1">
        {[['find', t('subCandidates')], ['matches', t('subMatches')]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`rounded-full py-2 text-[14px] ${sub === k ? 'bg-white font-semibold text-green-dark shadow-sm' : 'text-ink-2'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === 'matches' ? <Matches /> : (
        <div className="pt-5">
          <div className="rounded-[14px] bg-[#f0fdf4] px-4 py-3 text-[12px] leading-5 text-ink-2">
            {t('privacyBanner')}
          </div>
          <div className="flex gap-2 overflow-x-auto py-4">
            <button
              onClick={() => setTopicFilter('')}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] ${!topicFilter ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white text-ink-2'}`}
            >
              {t('all')}
            </button>
            {TOPICS.map((topic) => (
              <button
                key={topic}
                onClick={() => setTopicFilter(topic === topicFilter ? '' : topic)}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] ${topicFilter === topic ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white text-ink-2'}`}
              >
                {labels.topic(topic)}
              </button>
            ))}
          </div>
          {error && <div className="text-[13px] text-danger">{error}</div>}
          {candidates === null && <div className="text-ink-2">{t('loading')}</div>}
          {candidates !== null && ranked.length === 0 && (
            <div className="pt-8 text-center text-[14px] text-ink-2">{t('noCandidates')}</div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {ranked.map((c) => (
              <div key={c.id} className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-[16px] font-semibold text-green-dark">{c.displayName}</div>
                  {c.learningLevel && <span className="rounded-full bg-cream-2 px-2.5 py-1 text-[11px] text-ink-2">{labels.level(c.learningLevel)}</span>}
                </div>
                {c.bio && <div className="pt-1.5 text-[13px] leading-6 text-ink-2">{c.bio}</div>}
                <div className="flex flex-wrap gap-1.5 pt-3">
                  {(c.learningTopics || []).map((topic) => (
                    <span key={topic} className="rounded-full bg-[#f0fdf4] px-2.5 py-1 text-[11px] text-green-dark">{labels.topic(topic)}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[12px] text-ink-2">
                  {(c.preferredModes || []).length > 0 && <span>{c.preferredModes.map((m) => labels.mode(m)).join(' • ')}</span>}
                  {(c.availableDays || []).length > 0 && <span>{t('daysPrefix')} {c.availableDays.map((d) => labels.day(d)).join(' ')}</span>}
                </div>
                <button
                  onClick={() => toggleInterest(c)}
                  className={`mt-4 w-full rounded-full py-2.5 text-[14px] font-medium ${
                    c.myInterest === true
                      ? 'bg-green-light/40 text-green-dark'
                      : 'bg-green-dark text-white'
                  }`}
                >
                  {c.myInterest === true ? t('interestedDone') : t('interested')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
