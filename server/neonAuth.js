// Neon Auth (managed Better Auth) JWT verification for the dev vendor test.
// Verifies vendor-issued JWTs against the project's JWKS and maps the verified
// `sub` to one app user row (auth.users.auth_sub). The app user id - never the
// raw token - is what RLS sees via app.sub. No authorization decisions here.
import { createRemoteJWKSet, jwtVerify } from 'jose';

export function createNeonAuth({ jwksUrl, issuer, audience }) {
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));
  async function verify(token) {
    const { payload } = await jwtVerify(token, JWKS, { issuer, audience });
    if (!payload.sub) throw Object.assign(new Error('no_sub'), { status: 401 });
    return payload; // sub, email, name, role
  }
  return { verify };
}
