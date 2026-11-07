import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const target='https://chavruta-preview.efie770.workers.dev/';
for(const entry of ['index.html','404.html'])test(entry+' is a storage-preserving fixed handoff, never the former demo',()=>{
 const html=fs.readFileSync(entry,'utf8');assert.match(html,/<html lang="he" dir="rtl">/);assert.match(html,/name="viewport"/);assert.match(html,/http-equiv="refresh"/);
 const urls=[...html.matchAll(/https:\/\/[^\s"'<>;]+/g)].map(m=>m[0]);assert.equal(urls.length,3);assert(urls.every(u=>u===target));
 let actual;const location={search:'?utm_source=chatgpt.com',hash:'#/old',replace:u=>actual=u};const noStorage=new Proxy({},{get(){throw Error('must not access storage')}});vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{window:{location,localStorage:noStorage,sessionStorage:noStorage}});assert.equal(actual,target);assert(!/localStorage|sessionStorage|document\.cookie|assets\/app\.js|fetch\(/.test(html));assert.match(html,/<a href="https:\/\/chavruta-preview\.efie770\.workers\.dev\/"/);
});
test('deployment branch contains no old app, private files, or real source tree',()=>{assert.deepEqual(fs.readdirSync('.').filter(n=>!['.git','.github'].includes(n)).sort(),['.nojekyll','404.html','README.md','index.html','package.json','tests'].sort());assert.deepEqual(fs.readdirSync('tests'),['handoff.test.js']);const w=fs.readFileSync('.github/workflows/pages.yml','utf8');assert.match(w,/path: \./);});
