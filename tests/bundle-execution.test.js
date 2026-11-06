import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = ['google-chrome', 'google-chrome-stable', 'chromium'].find(b =>
  spawnSync('which', [b]).status === 0
);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function chromeDom(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--dump-dom', '--virtual-time-budget=6000', url]);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', () => resolve(out));
    proc.on('error', reject);
  });
}

test('built app bundle actually mounts and renders (React execution, not file-shape checks)', { skip: !CHROME && 'no chrome binary', timeout: 60000 }, async () => {
  const srv = await serve();
  try {
    const dom = await chromeDom(`http://127.0.0.1:${srv.address().port}/index.html`);
    assert.ok(dom.length > 10000, 'React rendered a substantial DOM, got ' + dom.length + ' bytes');
    assert.match(dom, /<div id="root"><div/, 'React mounted into #root');
    assert.match(dom, /האתר עדיין בגרסת הדגמה/, 'prototype warning banner rendered');
    assert.match(dom, /מתחברים לתורה/, 'landing content rendered');
    assert.ok(!dom.includes('<PROJECT-REF>'), 'no unresolved placeholder visible in rendered DOM');
  } finally { srv.close(); }
});
