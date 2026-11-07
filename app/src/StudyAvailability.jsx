import React from 'react';
import {useLang,useLabels} from './i18n.jsx';
import {STUDY_DURATIONS} from './availability.js';
export function AvailabilityFields({value,onChange,includeDays=false}) {
 const {t}=useLang();const labels=useLabels();const windows=value.availableWindows||[];
 const change=(i,key,v)=>onChange({...value,availableWindows:windows.map((w,j)=>j===i?{...w,[key]:v}:w)});
 return <fieldset className="min-w-0 space-y-3 rounded-xl border border-[#e7e5e4] bg-white p-3">
  <legend className="px-1 text-[14px] font-semibold text-green-dark">{t('studyAvailability')}</legend>
  {includeDays&&<div><span className="text-[13px] font-medium">{t('reqDays')}</span><div className="flex flex-wrap gap-1.5 pt-1.5">{['sun','mon','tue','wed','thu','fri','sat'].map(d=><button key={d} type="button" aria-pressed={(value.availableDays||[]).includes(d)} onClick={()=>onChange({...value,availableDays:(value.availableDays||[]).includes(d)?value.availableDays.filter(x=>x!==d):[...(value.availableDays||[]),d]})} className={`rounded-full border px-3 py-2 text-[13px] ${(value.availableDays||[]).includes(d)?'bg-green-dark text-white':'bg-white'}`}>{labels.day(d)}</button>)}</div></div>}
  <p className="text-[12px] leading-5 text-ink-2">{t('availabilityHelp')}</p>
  {windows.map((w,i)=><div key={i} className="rounded-xl bg-cream-2 p-2"><div className="grid grid-cols-2 gap-2">
   <label className="min-w-0 text-[12px]">{t('fromTime')}<input type="time" aria-label={`${t('fromTime')} ${i+1}`} value={w.start} onChange={e=>change(i,'start',e.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border bg-white px-2 py-2 text-[14px]" dir="ltr"/></label>
   <label className="min-w-0 text-[12px]">{t('untilTime')}<input type="time" aria-label={`${t('untilTime')} ${i+1}`} value={w.end} onChange={e=>change(i,'end',e.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border bg-white px-2 py-2 text-[14px]" dir="ltr"/></label>
  </div>{w.start&&w.end&&w.end<w.start&&<p className="pt-1 text-[11px]">{t('nextDay')}</p>}<button type="button" onClick={()=>onChange({...value,availableWindows:windows.filter((_,j)=>i!==j)})} className="mt-1 px-1 py-2 text-[12px] text-danger">{t('removeWindow')}</button></div>)}
  {windows.length<4&&<button type="button" onClick={()=>onChange({...value,availableWindows:[...windows,{start:'',end:''}]})} className="rounded-full border px-3 py-2 text-[13px]">{t('addWindow')}</button>}
  <label className="block text-[13px] font-medium">{t('studyDuration')}<select value={value.studyDurationMinutes??''} onChange={e=>onChange({...value,studyDurationMinutes:e.target.value===''?null:Number(e.target.value)})} className="mt-1 block w-full rounded-xl border bg-white px-3 py-3 text-[14px]">
   <option value="">{t('notSpecified')}</option>{STUDY_DURATIONS.map(n=><option key={n} value={n}>{t('durationMinutes',{n})}</option>)}
  </select></label>
 </fieldset>;
}
export function AvailabilitySummary({windows=[],duration=null}) {
 const {t}=useLang();if(!windows.length&&!duration)return null;
 return <div className="space-y-1 pt-2 text-[12px] leading-5 text-ink-2">{windows.length>0&&<p>{t('hoursPrefix')} {windows.map(w=>`${w.start}-${w.end}${w.end<w.start?' '+t('nextDay'):''}`).join(' · ')} · {t('israelTime')}</p>}{duration&&<p>{t('studyDuration')}: {t('durationMinutes',{n:duration})}</p>}</div>;
}
