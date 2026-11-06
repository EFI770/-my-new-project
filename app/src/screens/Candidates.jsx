import React, { useEffect, useMemo, useState } from 'react';
import { api, heError } from '../api.js';
import { useApp } from '../App.jsx';
import { TOPICS, LEVELS, MODES, DAYS } from '../labels.js';
import Matches from './Matches.jsx';

export default function Candidates() {
  const { me, showToast } = useApp();
  const [sub, setSub] = useState('find'); // find | matches
  const [candidates, setCandidates] = useState(null);
  const [topicFilter, setTopicFilter] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    try {
      const { candidates } = await api.candidates();
      setCandidates(candidates);
    } catch (err) { setError(heError(err)); }
  }
  useEffect(() => { load(); }, []);

  const myTopics = me.profile?.learning_topics || [];
  const ranked = useMemo(() => {
    if (!candidates) return [];
    const score = (c) =>
      (c.learningTopics || []).filter((t) => myTopics.includes(t)).length * 3 +
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
      showToast(next ? 'הבחירה נשמרה בפרטיות' : 'הבחירה בוטלה');
    } catch (err) {
      setCandidates((cs) => cs.map((x) => (x.id === c.id ? { ...x, myInterest: c.myInterest } : x)));
      showToast(heError(err));
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 rounded-full bg-cream-2 p-1">
        {[['find', 'מועמדים'], ['matches', 'התאמות']].map(([k, label]) => (
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
            הבחירה שלך פרטית לחלוטין: אף אחד לא רואה מי בחר בו. התאמה מוצגת רק כששני
            הצדדים בחרו זה בזה.
          </div>
          <div className="flex gap-2 overflow-x-auto py-4">
            <button
              onClick={() => setTopicFilter('')}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] ${!topicFilter ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white text-ink-2'}`}
            >
              הכל
            </button>
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopicFilter(t === topicFilter ? '' : t)}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] ${topicFilter === t ? 'border-green-dark bg-green-dark text-white' : 'border-[#e7e5e4] bg-white text-ink-2'}`}
              >
                {t}
              </button>
            ))}
          </div>
          {error && <div className="text-[13px] text-danger">{error}</div>}
          {candidates === null && <div className="text-ink-2">טוען…</div>}
          {candidates !== null && ranked.length === 0 && (
            <div className="pt-8 text-center text-[14px] text-ink-2">אין מועמדים להצגה כרגע.</div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {ranked.map((c) => (
              <div key={c.id} className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-[16px] font-semibold text-green-dark">{c.displayName}</div>
                  {c.learningLevel && <span className="rounded-full bg-cream-2 px-2.5 py-1 text-[11px] text-ink-2">{LEVELS[c.learningLevel]}</span>}
                </div>
                {c.bio && <div className="pt-1.5 text-[13px] leading-6 text-ink-2">{c.bio}</div>}
                <div className="flex flex-wrap gap-1.5 pt-3">
                  {(c.learningTopics || []).map((t) => (
                    <span key={t} className="rounded-full bg-[#f0fdf4] px-2.5 py-1 text-[11px] text-green-dark">{t}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[12px] text-ink-2">
                  {(c.preferredModes || []).length > 0 && <span>{c.preferredModes.map((m) => MODES[m]).join(' • ')}</span>}
                  {(c.availableDays || []).length > 0 && <span>ימים: {c.availableDays.map((d) => DAYS[d]).join(' ')}</span>}
                </div>
                <button
                  onClick={() => toggleInterest(c)}
                  className={`mt-4 w-full rounded-full py-2.5 text-[14px] font-medium ${
                    c.myInterest === true
                      ? 'bg-green-light/40 text-green-dark'
                      : 'bg-green-dark text-white'
                  }`}
                >
                  {c.myInterest === true ? '✓ נבחר (פרטי)' : 'מעוניין בחברותא'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
