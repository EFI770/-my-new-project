// DEVELOPMENT-ONLY local emulator for the future Supabase backend.
// Thin local wrapper around api.js: builds config from process.env, serves
// the built frontend from disk, and listens on a local port. The API itself
// lives in api.js so the exact same code also runs in the hosted worker.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { createApiHandler } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'app', 'dist');
const SOCKET_DIR = process.env.PGSOCKET || '/tmp/chavruta-pgsock-dev';
const DATABASE = process.env.PGDATABASE || 'chavruta_dev';
const PORT = Number(process.env.PORT || 4173);

const api = createApiHandler({
  authMode: process.env.CHAVRUTA_AUTH_MODE || 'dev',
  neonJwksUrl: process.env.NEON_AUTH_JWKS_URL,
  neonIssuer: process.env.NEON_AUTH_ISSUER,
  neonAudience: process.env.NEON_AUTH_AUDIENCE,
  neonManagement: process.env.NEON_MANAGEMENT_API_KEY ? {
    apiKey: process.env.NEON_MANAGEMENT_API_KEY,
    projectId: process.env.NEON_PROJECT_ID,
    branchId: process.env.NEON_BRANCH_ID,
    baseUrl: process.env.NEON_MANAGEMENT_BASE_URL,
  } : null,
  db: createDb({ socketDir: SOCKET_DIR, database: DATABASE }),
  env: process.env,
});

// ---------- static ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
function serveStatic(req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const index = path.join(DIST, 'index.html');
    if (fs.existsSync(index)) { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(fs.readFileSync(index)); }
    res.writeHead(404); return res.end('frontend not built');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

const server = http.createServer((req, res) => {
  if ((req.url || '').split('?')[0].startsWith('/api/') || (req.url || '').split('?')[0].startsWith('/vendor-auth/')) return api(req, res);
  return serveStatic(req, res);
});
if (!process.env.VERCEL) {
  server.listen(PORT, () => console.log(`dev emulator on :${PORT} (db: ${DATABASE} via ${SOCKET_DIR})`));
}

export default server;
