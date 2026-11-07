import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { initFirebase, signInWithGoogle, signOutFirebase, deleteFirebaseUser, currentFirebaseUser } from '../firebase.js';
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
  // Set after a successful Firebase Google sign-in when the server says the
  // identity is not registered yet: the form switches to the vendor-register
  // variant (name/gender/18+ only, no email/password) and registers with the
  // verified ID token.
  const [googleUser, setGoogleUser] = useState(null);
  // A persisted Firebase session without an app account (deleted account with
  // failed record erasure, or sign-in abandoned before registration): offer
  // finish-signup or explicit record removal with a retry + support route.
  const [pendingVendor, setPendingVendor] = useState(null);
  const [vendorState, setVendorState] = useState(null);
  useEffect(() => { api.providers().then(setProviders).catch(() => {}); }, []);
  useEffect(() => {
    if (!providers?.firebase?.enabled || !providers.firebase.config) return;
    initFirebase(providers.firebase.config)
      .then(async () => {
        const u = currentFirebaseUser();
        if (!u) return;
        const status = await api.authStatus();
        setVendorState(status.state);
        if (status.state !== 'registered') setPendingVendor(u);
      })
      .catch(() => {});
  }, [providers]);

  async function removeVendorRecord() {
    setOauthBusy(true);
    setError(null);
    try {
      await deleteFirebaseUser();
      setPendingVendor(null);
      showToast(t('toastSigninRecordRemoved'));
    } catch {
      setError(t('signinRecordRemoveFailed'));
    }
    setOauthBusy(false);
  }

  async function googleSignIn() {
    setOauthBusy(true);
    setError(null);
    try {
      if (providers?.firebase?.enabled && providers.firebase.config) {
        // Firebase route: popup sign-in, then check whether this identity is
        // already registered with the community.
        await initFirebase(providers.firebase.config);
        const user = await signInWithGoogle();
        const status = await api.authStatus();
        setVendorState(status.state);
        if (status.state === 'registered') {
          showToast(t('toastWelcome'));
          await refreshMe();
          navigate('find');
        } else if (status.state === 'new') {
          setGoogleUser(user);
          setDisplayName(user.displayName || '');
          setMode('register');
        } else {
          setPendingVendor(user);
          setGoogleUser(null);
          setError(t('err_account_deleted'));
        }
        return;
      }
      // Legacy Neon Auth (Better Auth) social flow is POST-then-redirect:
      // the endpoint returns {url} and the browser must navigate there.
      // Verified against the live vendor 2026-11-06 (GET is 404; POST returns
      // the init URL).
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
    } finally {
      setOauthBusy(false);
    }
  }

  // Leaving the Google registration variant abandons the unregistered vendor
  // session, so no dangling signed-in-but-unregistered identity lingers.
  async function switchMode(k) {
    if (googleUser && k !== 'register') {
      await signOutFirebase();
      setGoogleUser(null);
    }
    setMode(k); setError(null);
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
      if (googleUser) {
        // Vendor registration: the Bearer ID token is attached by the token
        // provider; the server binds the verified subject. No password.
        try {
          await api.register({ displayName, gender, attestAdult });
          showToast(t('toastRegistered'));
        } catch (err) {
          // Already registered on the server (e.g. earlier attempt): just enter.
          if (err?.code !== 'already_registered') throw err;
          showToast(t('toastWelcome'));
        }
        setGoogleUser(null);
        setPendingVendor(null);
        await refreshMe();
        navigate('find');
        return;
      }
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
    <div className="auth-entry mx-auto min-h-screen max-w-[480px] px-5">
      <header className="pt-5">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('')} className="text-[13px] text-ink-2">{t('back')}</button>
          <LangSwitch />
        </div>
        <div className="auth-brand pt-4 text-[30px] font-bold text-green-dark">{t('brand')}</div>
        <div className="text-[13px] text-ink-2">{t('authSubtitle')}</div>
      </header>

      <div className="auth-privacy pt-5 text-[13px] leading-6 text-ink-2">
        {t('authPrivacy')}
      </div>

      {(googleUser || providers?.email?.enabled) && (
      <>
      {!providers?.firebase?.enabled && (
      <div className="mt-5 grid grid-cols-2 rounded-full bg-cream-2 p-1">
        {[['login', t('login')], ['register', t('register')]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => switchMode(k)}
            aria-pressed={mode === k}
            className={`rounded-full py-2 text-[14px] ${mode === k ? 'bg-white font-semibold text-green-dark shadow-sm' : 'text-ink-2'}`}
          >
            {label}
          </button>
        ))}
      </div>

      )}
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
        {googleUser && (
          <p className="rounded-xl bg-cream-2 px-4 py-3 text-[12px] leading-5 text-ink-2">{t('googleSignupNote')}</p>
        )}
        {!googleUser && (
        <>
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
        </>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-green-dark py-3 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? t('busy') : googleUser ? t('finishSignup') : mode === 'register' ? t('register') : t('login')}
        </button>
      </form>
      </>
      )}
      {providers?.demo?.enabled && providers?.email?.enabled === false && (
        <p className="rounded-xl bg-cream-2 px-4 py-3 text-center text-[12px] leading-5 text-ink-2">{t('demoOnlyNote')}</p>
      )}
      {providers?.demo?.enabled && (
        <div className="auth-actions pt-4 space-y-2">
          <p className="text-center text-[12px] font-semibold text-ink-2">{t('demoTitle')}</p>
          <div className="grid grid-cols-2 gap-2">
            {[['man', 'demoMan'], ['man2', 'demoMan2'], ['woman', 'demoWoman'], ['woman2', 'demoWoman2']].map(([id, labelKey]) => (
              <button
                key={id}
                type="button"
                onClick={() => demoSignIn(id)}
                disabled={oauthBusy}
                className="block w-full rounded-full border border-[#e7e5e4] bg-white py-3 text-center text-[14px] font-semibold text-ink disabled:opacity-60"
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}
        {error && <div role="alert" className="rounded-xl bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">{error}</div>}
      {pendingVendor && !googleUser && (
        <div className="auth-actions pt-4 space-y-2">
          <p className="rounded-xl bg-cream-2 px-4 py-3 text-[12px] leading-5 text-ink-2">{t(vendorState === 'deleted' ? 'deletedVendorSessionNote' : 'vendorSessionNote')}</p>
          {vendorState === 'new' && <button
            type="button"
            onClick={() => { setGoogleUser(pendingVendor); setDisplayName(pendingVendor.displayName || ''); setMode('register'); }}
            disabled={oauthBusy}
            className="block w-full rounded-full bg-green-dark py-3 text-center text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {t('finishSignup')}
          </button>}
          <button
            type="button"
            onClick={removeVendorRecord}
            disabled={oauthBusy}
            className="block w-full rounded-full border border-[#e7e5e4] bg-white py-3 text-center text-[14px] font-semibold text-ink disabled:opacity-60"
          >
            {t('removeSigninRecord')}
          </button>
        </div>
      )}
      {((providers?.firebase?.enabled && providers.firebase.config) || (providers?.google?.enabled && providers.google.authUrl)) && (
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
