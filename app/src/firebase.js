// Firebase Authentication client: Google sign-in for app users (owner decision
// 2026-11-07, replaces the Neon-Auth Google plan). The firebase package is
// imported lazily, only when the server reports the firebase provider enabled,
// so demo/dev builds never download it. The web config values arrive from
// GET /api/auth/providers and are public by design (Google docs: Firebase API
// keys identify the project, they are not access-control secrets); every
// authorization decision is enforced server-side.
import { api } from './api.js';

let auth = null;
let mod = null;

export async function initFirebase(config) {
  if (auth) return auth;
  const [{ initializeApp }, authMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  mod = authMod;
  auth = authMod.getAuth(initializeApp(config));
  // Wait for any persisted session to be restored before the app calls /api/me.
  if (auth.authStateReady) await auth.authStateReady();
  // Every API call carries the current Firebase ID token while signed in.
  api.setTokenProvider(async () => {
    const u = auth && auth.currentUser;
    return u ? u.getIdToken() : null;
  });
  return auth;
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('firebase_not_initialized');
  const cred = await mod.signInWithPopup(auth, new mod.GoogleAuthProvider());
  return cred.user;
}

export async function signOutFirebase() {
  if (auth) await mod.signOut(auth).catch(() => {});
}

// Erases the Firebase identity record after server-side data is already gone.
// Firebase requires a recent sign-in for deletion; on auth/requires-recent-login
// we re-authenticate with a fresh Google popup and retry once.
export async function deleteFirebaseUser() {
  const u = auth && auth.currentUser;
  if (!u) return;
  try {
    await u.delete();
  } catch (e) {
    if (e && e.code === 'auth/requires-recent-login') {
      await mod.reauthenticateWithPopup(u, new mod.GoogleAuthProvider());
      await u.delete();
    } else {
      throw e;
    }
  }
}
