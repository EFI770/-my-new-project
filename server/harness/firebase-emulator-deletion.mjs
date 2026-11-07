import assert from 'node:assert/strict';
const base='http://127.0.0.1:9099';
async function auth(method,p,b){const r=await fetch(`${base}/identitytoolkit.googleapis.com/v1/${p}?key=local-test-key`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(b)});return {status:r.status,data:await r.json()};}
const a=await auth('POST','accounts:signUp',{email:'local-deletion-test@example.invalid',password:'local-test-password',returnSecureToken:true});assert.equal(a.status,200);
const b=await auth('POST','accounts:signUp',{email:'local-survivor-test@example.invalid',password:'local-test-password',returnSecureToken:true});assert.equal(b.status,200);
const oldToken=a.data.idToken;const oldRefresh=a.data.refreshToken;const oldUid=a.data.localId;
let r=await auth('POST','accounts:lookup',{idToken:oldToken});assert.equal(r.data.users[0].localId,oldUid);console.log('PASS self lookup binds same identity');
r=await auth('POST','accounts:delete',{idToken:oldToken});assert.equal(r.status,200);console.log('PASS self delete accepted');
r=await auth('POST','accounts:lookup',{idToken:oldToken});assert.equal(r.data.error.message,'USER_NOT_FOUND');console.log('PASS deleted identity lookup rejected with still-held old ID token');
r=await fetch(`${base}/securetoken.googleapis.com/v1/token?key=local-test-key`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:oldRefresh})});const refreshData=await r.json();assert(r.status>=400);assert(/USER_NOT_FOUND|INVALID_REFRESH_TOKEN|TOKEN_EXPIRED/.test(refreshData.error.message));console.log('PASS deleted identity refresh rejected');
r=await auth('POST','accounts:lookup',{idToken:b.data.idToken});assert.equal(r.data.users[0].localId,b.data.localId);console.log('PASS unrelated identity survives');
r=await auth('POST','accounts:signUp',{email:'local-deletion-test@example.invalid',password:'local-test-password',returnSecureToken:true});assert.equal(r.status,200);assert.notEqual(r.data.localId,oldUid);console.log('PASS explicit rejoin creates different UID');
console.log('LOCAL EMULATOR ONLY, not live Google acceptance');
