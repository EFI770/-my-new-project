import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { errText, useLang, useLabels } from '../i18n.jsx';
import { useApp, LangSwitch } from '../App.jsx';

export default function AuthScreen() {
  const { refreshMe, showToast, navigate } = useApp();
  const { t } = useLang();
  const labels = useLabels();
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [attestAdult, setAttestAdult] = useState(false);
  const [error, setError] = useState(null);
  // Google sign-in for app users (owner decision): rendered only when the
  // server reports the vendor provider configured. Disabled by default.
  const [providers, setProviders] = useState(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  useEffect(() => { api.providers().then(setProviders).catch(() => {}); }, []);

  // Neon Auth (Better Auth) social flow is POST-then-redirect: the endpoint
  // returns {url} and the browser must navigate there. Verified against the
  // live vendor 2026-11-06 (GET on the endpoint is 404; POST returns init URL).
  async function googleSignIn() {
    setOauthBusy(true);
    setError(null);
    try {
      const r = await fetch(`${providers.google.authUrl}/sign-in/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: `${window.location.origin}/#/auth` }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.url) { window.location.assign(data.url); return; }
      setError(t('oauthStartFailed'));
    } catch {
      setError(t('oauthStartFailed'));
    }
    setOauthBusy(false);
  }
  const [busy, setBusy] = useState(false);

  // Synthetic demo entry (gated preview only): rendered only when the server
  // reports demo mode enabled. Two fixed seeded identities, no password.
  async function demoSignIn(identity) {
    setOauthBusy(true);
    setError(null);
    try {
      await api.demoLogin(identity);
      showToast(t('toastWelcome'));
      await refreshMe();
      navigate('find');
    } catch {
      setError(t('oauthStartFailed'));
    }
    setOauthBusy(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && !gender) {
      setError(t('genderRequired'));
      return;
    }
    if (mode === 'register' && !attestAdult) {
      setError(t('ageAttestRequired'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register({ email, password, displayName, gender, attestAdult });
        showToast(t('toastRegistered'));
      } else {
        await api.login({ email, password });
        showToast(t('toastWelcome'));
      }
      await refreshMe();
      navigate('find');
    } catch (err) {
      setError(errText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-[380px] px-5">
      <header className="pt-5">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('')} className="text-[13px] text-ink-2">{t('back')}</button>
          <LangSwitch />
        </div>
        <div className="pt-4 text-[20px] font-bold text-green-dark">{t('brand')}</div>
        <div className="text-[13px] text-ink-2">{t('authSubtitle')}</div>
      </header>

      <div className="pt-5 text-[12px] leading-6 text-ink-2">
        {t('authPrivacy')}
      </div>

      {!(providers?.demo?.enabled && providers?.email?.enabled === false) && (
      <>
      <div className="mt-5 grid grid-cols-2 rounded-full bg-cream-2 p-1">
        {[['login', t('login')], ['register', t('register')]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setMode(k); setError(null); }}
            aria-pressed={mode === k}
            className={`rounded-full py-2 text-[14px] ${mode === k ? 'bg-white font-semibold text-green-dark shadow-sm' : 'text-ink-2'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4 pt-6">
        {mode === 'register' && (
          <>
            <label className="block">
              <span className="text-[13px] font-medium text-ink">{t('displayName')}</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('displayNamePlaceholder')}
                className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px]"
                required
                maxLength={80}
              />
            </label>
            <div>
              <span className="text-[13px] font-medium text-ink">{t('genderLabel')}</span>
              <div className="grid grid-cols-2 gap-2 pt-1.5">
                {['man', 'woman'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    aria-pressed={gender === g}
                    className={`rounded-xl border py-3 text-[15px] font-medium ${
                      gender === g
                        ? 'border-green-dark bg-green-dark text-white'
                        : 'border-[#e7e5e4] bg-white text-ink'
                    }`}
                  >
                    {labels.gender(g)}
                  </button>
                ))}
              </div>
              <div className="pt-1.5 text-[11px] leading-5 text-ink-2">{t('genderNote')}</div>
            </div>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={attestAdult}
                onChange={(e) => setAttestAdult(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-green-dark"
              />
              <span className="text-[13px] leading-5 text-ink">{t('ageAttest')}</span>
            </label>
          </>
        )}
        <label className="block">
          <span className="text-[13px] font-medium text-ink">{t('email')}</span>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px] text-left"
            required
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-ink">{t('password')}</span>
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-[15px] text-left"
            required
            minLength={mode === 'register' ? 8 : 1}
          />
          {mode === 'register' && <span className="text-[11px] text-ink-2">{t('passwordHint')}</span>}
        </label>
        {error && <div role="alert" className="rounded-xl bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-green-dark py-3 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? t('busy') : mode === 'register' ? t('register') : t('login')}
        </button>
      </form>
      </>
      )}
      {providers?.demo?.enabled && providers?.email?.enabled === false && (
        <p className="rounded-xl bg-cream-2 px-4 py-3 text-center text-[12px] leading-5 text-ink-2">{t('demoOnlyNote')}</p>
      )}
      {providers?.demo?.enabled && (
        <div className="pt-4 space-y-2">
          <p className="text-center text-[12px] font-semibold text-ink-2">{t('demoTitle')}</p>
          <button
            type="button"
            onClick={() => demoSignIn('man')}
            disabled={oauthBusy}
            className="block w-full rounded-full border border-[#e7e5e4] bg-white py-3 text-center text-[15px] font-semibold text-ink disabled:opacity-60"
          >
            {t('demoMan')}
          </button>
          <button
            type="button"
            onClick={() => demoSignIn('woman')}
            disabled={oauthBusy}
            className="block w-full rounded-full border border-[#e7e5e4] bg-white py-3 text-center text-[15px] font-semibold text-ink disabled:opacity-60"
          >
            {t('demoWoman')}
          </button>
        </div>
      )}
      {providers?.google?.enabled && providers.google.authUrl && (
        <div className="pt-4">
          <button
            type="button"
            onClick={googleSignIn}
            disabled={oauthBusy}
            className="block w-full rounded-full border border-[#e7e5e4] bg-white py-3 text-center text-[15px] font-semibold text-ink disabled:opacity-60"
          >
            {t('continueWithGoogle')}
          </button>
        </div>
      )}
    </div>
  );
}
