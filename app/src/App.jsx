import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { initFirebase } from './firebase.js';
import { LangProvider, useLang } from './i18n.jsx';
import Landing from './screens/Landing.jsx';
import AuthScreen from './screens/Auth.jsx';
import Candidates from './screens/Candidates.jsx';
import Requests from './screens/Requests.jsx';
import Connections from './screens/Connections.jsx';
import Profile from './screens/Profile.jsx';
import { Privacy, Accessibility } from './screens/Legal.jsx';

const AppCtx = createContext(null);
export function useApp() { return useContext(AppCtx); }

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#\/?/, '') || '');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#\/?/, '') || '');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((to) => { window.location.hash = `/${to}`; }, []);
  return [hash, navigate];
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
      className="rounded-full border border-[#e7e5e4] bg-white px-3 py-1.5 text-[12px] font-medium text-ink-2"
      aria-label={lang === 'he' ? 'EN - Switch language to English' : 'עב - מעבר לשפה עברית'}
    >
      {lang === 'he' ? 'EN' : 'עב'}
    </button>
  );
}

function Shell() {
  const [route, navigate] = useHashRoute();
  const [me, setMe] = useState(undefined); // undefined=loading, null=logged out
  const [toast, setToast] = useState(null);
  const { t } = useLang();
  const [isDemo, setIsDemo] = useState(false);

  const TABS = [
    { key: 'find', label: t('tabFind') },
    { key: 'requests', label: t('tabRequests') },
    { key: 'connections', label: t('tabConnections') },
    { key: 'me', label: t('tabMe') },
  ];

  const refreshMe = useCallback(async () => {
    try { setMe(await api.me()); } catch { setMe(null); }
  }, []);
  // Boot order: restore the vendor session (Firebase persists it in IndexedDB)
  // BEFORE the first /api/me, or a returning signed-in user looks logged out.
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const p = await api.providers();
        setIsDemo(p?.demo?.enabled === true);
        if (p?.firebase?.enabled && p.firebase.config) await initFirebase(p.firebase.config);
      } catch { /* vendor unreachable: email/dev entry still works */ }
      setAuthReady(true);
    })();
  }, []);
  useEffect(() => { if (authReady) refreshMe(); }, [authReady, refreshMe]);

  const showToast = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Hooks must run unconditionally (before any early return).
  const mainRef = React.useRef(null);
  const tab = TABS.some((tb) => tb.key === route) ? route : 'find';
  // Move focus to main only on an actual tab change, never on initial load:
  // focusing main on load would defeat the skip link as first tab stop.
  const prevTab = React.useRef(null);
  useEffect(() => {
    if (!me) return;
    if (prevTab.current !== null && prevTab.current !== tab) mainRef.current?.focus({ preventScroll: true });
    prevTab.current = tab;
  }, [tab, me]);

  if (me === undefined || !authReady) {
    return <div role="status" className="min-h-screen grid place-items-center text-ink-2">{t('loading')}</div>;
  }

  const ctx = { me, refreshMe, showToast, navigate };

  if (!me) {
    return (
      <AppCtx.Provider value={ctx}>
        <main id="main">{route === 'auth' ? <AuthScreen /> : route === 'privacy' ? <Privacy /> : route === 'accessibility' ? <Accessibility /> : <Landing />}</main>
        {toast && <Toast text={toast} />}
      </AppCtx.Provider>
    );
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="community-shell mx-auto min-h-screen max-w-[1120px] pb-24">
        {isDemo && <div className="demo-ribbon">{t('designDemo')}</div>}
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-green-dark focus:px-4 focus:py-2 focus:text-white">{t('skipToContent')}</a>
        <header className="community-header flex items-center justify-between px-5 py-5">
          <div>
            <div className="text-[20px] font-bold text-green-dark">{t('brand')}</div>
            <div className="text-[12px] text-ink-2">{t('tagline')}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[13px] text-ink-2">{t('greeting', { name: me.profile?.displayName || t('fallbackName') })}</div>
            <LangSwitch />
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="px-5 pt-5 outline-none">
          {route === 'privacy' && <Privacy />}
          {route === 'accessibility' && <Accessibility />}
          {tab === 'find' && <Candidates />}
          {tab === 'requests' && <Requests />}
          {tab === 'connections' && <Connections />}
          {tab === 'me' && <Profile />}
        </main>
        <nav aria-label={t('navLabel')} className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e7e5e4] bg-white/90 backdrop-blur">
          <div className="mx-auto grid max-w-[1120px] grid-cols-4">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                onClick={() => navigate(tb.key)}
                aria-current={tab === tb.key ? 'page' : undefined}
                className={`min-h-[48px] px-1 py-2.5 text-[13px] leading-tight ${tab === tb.key ? 'font-semibold text-green-dark' : 'text-ink-2'}`}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
      {toast && <Toast text={toast} />}
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <LangProvider>
      <Shell />
    </LangProvider>
  );
}

export function Toast({ text }) {
  return (
    <div role="status" aria-live="polite" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-green-dark px-5 py-2.5 text-[14px] text-white shadow-xl">
      {text}
    </div>
  );
}
