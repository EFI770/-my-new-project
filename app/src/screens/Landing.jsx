import React from 'react';
import { useApp, LangSwitch } from '../App.jsx';
import { useLang } from '../i18n.jsx';

export default function Landing() {
  const { navigate } = useApp();
  const { t } = useLang();
  return (
    <div className="mx-auto min-h-screen max-w-[920px] px-5">
      <header className="flex items-center justify-between pt-5">
        <div>
          <div className="text-[20px] font-bold text-green-dark">{t('brand')}</div>
          <div className="text-[12px] text-ink-2">{t('tagline')}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <LangSwitch />
          <button
            onClick={() => navigate('auth')}
            className="rounded-full bg-green-dark px-5 py-2.5 text-[14px] font-medium text-white"
          >
            {t('landingLogin')}
          </button>
        </div>
      </header>

      <section className="pt-14 text-center">
        <div className="text-[13px] text-ink-2">{t('landingKicker')}</div>
        <h1 className="pt-3 text-[36px] font-bold leading-[0.95] tracking-tight text-green-dark md:text-[52px]">
          {t('landingHero1')}
          <br />
          {t('landingHero2')}
        </h1>
        <p className="mx-auto max-w-[52ch] pt-5 text-[15px] leading-7 text-ink-2">
          {t('landingIntro')}
        </p>
        <div className="flex justify-center gap-3 pt-7">
          <button
            onClick={() => navigate('auth')}
            className="rounded-full bg-green-dark px-6 py-3 text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(27,67,50,0.2)]"
          >
            {t('landingJoin')}
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5 pt-6 text-[12px] text-ink-2">
          <span className="rounded-full border border-[#e7e5d4] bg-white px-3 py-1.5">{t('chipPrivacy')}</span>
          <span className="rounded-full border border-[#e7e5d4] bg-white px-3 py-1.5">{t('chipCommunity')}</span>
          <span className="rounded-full border border-[#e7e5d4] bg-white px-3 py-1.5">{t('chipRemote')}</span>
          <span className="rounded-full border border-[#e7e5d4] bg-white px-3 py-1.5">{t('chipSeparation')}</span>
        </div>
      </section>

      <section className="grid gap-4 pt-14 md:grid-cols-3">
        {[
          [t('feat1Title'), t('feat1Body')],
          [t('feat2Title'), t('feat2Body')],
          [t('feat3Title'), t('feat3Body')],
        ].map(([title, body]) => (
          <div key={title} className="rounded-[20px] border border-[#f5f5f4] bg-white p-5 shadow-sm">
            <div className="text-[16px] font-semibold text-green-dark">{title}</div>
            <div className="pt-2 text-[14px] leading-6 text-ink-2">{body}</div>
          </div>
        ))}
      </section>

      <footer className="py-10 text-center text-[12px] leading-6 text-ink-2">
        <div>{t('landingFooter1')}</div>
        <nav className="flex justify-center gap-4 pt-2" aria-label={t('legalNavLabel')}>
          <a href="#/privacy" className="underline">{t('footerPrivacy')}</a>
          <a href="#/accessibility" className="underline">{t('footerAccessibility')}</a>
        </nav>
      </footer>
    </div>
  );
}
