import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import Landing from './screens/Landing.jsx';
import AuthScreen from './screens/Auth.jsx';
import Candidates from './screens/Candidates.jsx';
import Requests from './screens/Requests.jsx';
import Connections from './screens/Connections.jsx';
import Profile from './screens/Profile.jsx';

const AppCtx = createContext(null);
export function useApp() { return useContext(AppCtx); }

const TABS = [
  { key: 'find', label: 'מציאת חברותא' },
  { key: 'requests', label: 'בקשות לימוד' },
  { key: 'connections', label: 'חיבורים' },
  { key: 'me', label: 'אזור אישי' },
];

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

export default function App() {
  const [route, navigate] = useHashRoute();
  const [me, setMe] = useState(undefined); // undefined=loading, null=logged out
  const [toast, setToast] = useState(null);

  const refreshMe = useCallback(async () => {
    try { setMe(await api.me()); } catch { setMe(null); }
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const showToast = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(null), 3000);
  }, []);

  if (me === undefined) {
    return <div className="min-h-screen grid place-items-center text-ink-2">טוען…</div>;
  }

  const ctx = { me, refreshMe, showToast, navigate };

  if (!me) {
    return (
      <AppCtx.Provider value={ctx}>
        {route === 'auth' ? <AuthScreen /> : <Landing />}
        {toast && <Toast text={toast} />}
      </AppCtx.Provider>
    );
  }

  const tab = TABS.some((t) => t.key === route) ? route : 'find';
  return (
    <AppCtx.Provider value={ctx}>
      <div className="mx-auto min-h-screen max-w-[920px] pb-24">
        <header className="flex items-center justify-between px-5 pt-5">
          <div>
            <div className="text-[20px] font-bold text-green-dark">חברותא</div>
            <div className="text-[12px] text-ink-2">רתמים • פיילוט קהילתי</div>
          </div>
          <div className="text-[13px] text-ink-2">שלום, {me.profile?.displayName || 'לומד'}</div>
        </header>
        <main className="px-5 pt-5">
          {tab === 'find' && <Candidates />}
          {tab === 'requests' && <Requests />}
          {tab === 'connections' && <Connections />}
          {tab === 'me' && <Profile />}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e7e5e4] bg-white/90 backdrop-blur">
          <div className="mx-auto grid max-w-[920px] grid-cols-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => navigate(t.key)}
                className={`py-3 text-[13px] ${tab === t.key ? 'font-semibold text-green-dark' : 'text-ink-2'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
      {toast && <Toast text={toast} />}
    </AppCtx.Provider>
  );
}

export function Toast({ text }) {
  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-green-dark px-5 py-2.5 text-[14px] text-white shadow-xl">
      {text}
    </div>
  );
}
