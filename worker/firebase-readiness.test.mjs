import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

test('gated Firebase deployment exposes only Google config, never demo or password entry',async()=>{
 const key='synthetic-gate-contract-0123456789';
 const env={AUTH_MODE:'firebase',PREVIEW_GATE_KEY:key,PREVIEW_DEMO_MODE:'true',FIREBASE_SIGNIN_ENABLED:'true',FIREBASE_PROJECT_ID:'synthetic-project',FIREBASE_API_KEY:'synthetic-not-a-real-key',FIREBASE_APP_ID:'synthetic-app',FIREBASE_JWKS_URL:'http://127.0.0.1:1/untrusted',HYPERDRIVE_APP:{connectionString:'postgresql://unused:unused@127.0.0.1:1/x'},HYPERDRIVE_ADMIN:{connectionString:'postgresql://unused:unused@127.0.0.1:1/x'},ASSETS:{fetch:()=>new Response('synthetic asset')}};
 const get=(path,gate=true)=>worker.fetch(new Request('https://preview.example'+path,{headers:gate?{'x-preview-gate':key}:{}}),env);
 assert.equal((await get('/api/auth/providers',false)).status,403);
 const p=await (await get('/api/auth/providers')).json();
 assert.equal(p.firebase.enabled,true);assert.equal(p.firebase.config.projectId,'synthetic-project');assert.equal(p.demo.enabled,false);assert.equal(p.email.enabled,false);
 const demo=await worker.fetch(new Request('https://preview.example/api/auth/demo-login',{method:'POST',headers:{'x-preview-gate':key,'content-type':'application/json'},body:JSON.stringify({identity:'man'})}),env);
 assert.equal(demo.status,404);
 const me=await worker.fetch(new Request('https://preview.example/api/me',{headers:{'x-preview-gate':key,authorization:'Bearer fake'}}),env);
 assert.equal(me.status,401);
 assert.equal((await get('/',false)).status,403);
});
