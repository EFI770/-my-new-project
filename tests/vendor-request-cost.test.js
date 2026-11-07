import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {generateKeyPair,exportJWK,SignJWT} from '../server/node_modules/jose/dist/webapi/index.js';
import {createApiHandler} from '../server/api.js';
test('vendor age gate is fresh and fails closed without third DB connection',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'request-cost',alg:'RS256',use:'sig'});
 const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({keys:[jwk]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{let adult=true,exists=true,calls=0,rls=0;
 const api=createApiHandler({authMode:'firebase',firebaseProjectId:'request-cost',firebaseJwksUrl:`http://127.0.0.1:${server.address().port}`,firebaseAllowJwksOverride:true,db:{asService:async fn=>{calls++;return fn({query:async q=>{assert.match(q,/left join public.profiles/);return {rows:exists?[{id:'synthetic-id',age_attested_at:adult?'2026-11-07':null}]:[]};}});},withRls:async (id,fn)=>{assert.equal(id,'synthetic-id');rls++;return fn({query:async()=>({rows:[]})});}}});
 const now=Math.floor(Date.now()/1000);const jwt=await new SignJWT({sub:'local-only',auth_time:now}).setIssuedAt(now).setExpirationTime(now+3600).setIssuer('https://securetoken.google.com/request-cost').setAudience('request-cost').setProtectedHeader({alg:'RS256',kid:'request-cost'}).sign(privateKey);
 async function call(){let status,body;await api({url:'/api/candidates',method:'GET',headers:{authorization:'Bearer '+jwt},socket:{remoteAddress:'127.0.0.1'}},{writeHead:s=>status=s,end:b=>body=b});return {status,body};}
 assert.equal((await call()).status,200);assert.equal(calls,1);assert.equal(rls,1);
 adult=false;assert.equal((await call()).status,403);assert.equal(calls,2);assert.equal(rls,1);
 exists=false;assert.equal((await call()).status,401);assert.equal(calls,3);assert.equal(rls,1);
 }finally{await new Promise(r=>server.close(r));}
});
