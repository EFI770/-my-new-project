// Firebase Authentication (Google sign-in for app end-users, owner decision
// 2026-11-07) ID-token verification for community mode. Verifies Firebase-issued
// ID tokens against Google's public securetoken JWKS and maps the verified `sub`
// (Firebase uid) to one app user row (auth.users.auth_sub). The app user id -
// never the raw token - is what RLS sees via app.sub. No authorization decisions
// here. By design this module needs NO service-account or admin credentials:
// verification uses only Google's public certs + the public project id.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const DEFAULT_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export function createFirebaseAuth({ projectId, jwksUrl, allowJwksOverride }) {
  if (!projectId) throw new Error('firebase_project_id_required');
  // jwksUrl override exists ONLY for hermetic tests (local JWKS server). It is
  // a deployment-config bypass: a production env that points JWKS elsewhere
  // would let an attacker mint valid-looking tokens, so it must be explicitly
  // enabled and is never wired in the Worker deployment path.
  if (jwksUrl && allowJwksOverride !== true) throw new Error('jwks_override_not_allowed');
  const JWKS = createRemoteJWKSet(new URL(jwksUrl || DEFAULT_JWKS));
  async function verify(token) {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (!payload.sub) throw Object.assign(new Error('no_sub'), { status: 401 });
    return payload; // sub (Firebase uid), email, name
  }
  return { verify };
}
