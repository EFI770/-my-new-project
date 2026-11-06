// Local HTTP adapter: serves worker/index.js's fetch over node:http so the
// existing API harness can exercise the WORKER code path unchanged.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import worker from './index.js';

const DIST = path.resolve('../app/dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const CONN = 'postgresql://postgres@/chavruta_dev?host=/tmp/chavruta-pgsock-dev';
const env = {
  PREVIEW_GATE_KEY: 'local-test-gate-key-0123456789abcdef',
  HYPERDRIVE_APP: { connectionString: CONN },
  HYPERDRIVE_ADMIN: { connectionString: CONN },
  ASSETS: { async fetch(request) {
    let p = new URL(request.url).pathname; if (p === '/') p = '/index.html';
    const f0 = path.join(DIST, path.normalize(p).replace(/^([/\\])+/, ''));
    const f = fs.existsSync(f0) && fs.statSync(f0).isFile() ? f0 : path.join(DIST, 'index.html');
    return new Response(fs.readFileSync(f), { headers: { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' } });
  } },
};

http.createServer(async (nodeReq, nodeRes) => {
  const chunks = [];
  for await (const c of nodeReq) chunks.push(c);
  const headers = new Headers(nodeReq.headers);
  headers.set('x-preview-gate', env.PREVIEW_GATE_KEY); // local adapter: gate pre-satisfied
  const res = await worker.fetch(new Request('http://local' + nodeReq.url, { method: nodeReq.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), env);
  const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
  nodeRes.writeHead(res.status, h);
  nodeRes.end(Buffer.from(await res.arrayBuffer()));
}).listen(4591, () => console.log('worker adapter on :4591'));
