import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('deploy/legacy-entry/index.html','utf8');
test('prepared old-link compatibility entry has only fixed canonical destination',()=>{
 const destinations=[...html.matchAll(/https:\/\/[^\s"'<>;]+/g)].map(m=>m[0]);assert.equal(destinations.length,3);assert(destinations.every(s=>s==='https://chavruta-preview.efie770.workers.dev/'));
 let destination;vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{window:{location:{replace:v=>destination=v}}});assert.equal(destination,destinations[0]);
 assert(!/localStorage|sessionStorage|\.search|\.hash|document\.cookie/.test(html));assert.match(html,/http-equiv="refresh"/);assert.match(html,/<a href=/);
});
test('dedicated compatibility artifact contains only fixed handoff',()=>{const workflow=fs.readFileSync('.github/workflows/pages.yml','utf8');assert.match(workflow,/path: \./);assert(!fs.existsSync('deploy/legacy-entry/assets'));});
