import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPair,exportJWK,SignJWT} from '../server/node_modules/jose/dist/webapi/index.js';
import {createFirebaseAuth} from '../server/firebaseAuth.js';

test('Firebase verifier rejects signed tokens outside documented claim contract',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
 const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'test',alg:'RS256',use:'sig'});
 const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({keys:[jwk]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 const auth=createFirebaseAuth({projectId:'contract-test',jwksUrl:`http://127.0.0.1:${server.address().port}/jwks`,allowJwksOverride:true});
 const now=Math.floor(Date.now()/1000);
 const valid={sub:'synthetic-uid',iat:now-5,auth_time:now-10,exp:now+3600,iss:'https://securetoken.google.com/contract-test',aud:'contract-test'};
 const sign=claims=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).sign(privateKey);
 assert.equal((await auth.verify(await sign(valid))).sub,valid.sub);
 for(const key of ['sub','exp','iat','auth_time']){const claims={...valid};delete claims[key];await assert.rejects(auth.verify(await sign(claims)),key+' required');}
 for(const patch of [{iat:now+60},{auth_time:now+60},{auth_time:now-1},{iat:'bad'},{auth_time:'bad'},{exp:'bad'},{sub:' '},{sub:'x'.repeat(129)},{exp:now-1},{aud:'other'},{iss:'other'}]){
 await assert.rejects(auth.verify(await sign({...valid,...patch})),JSON.stringify(patch));
 }
 }finally{await new Promise(r=>server.close(r));}
});
