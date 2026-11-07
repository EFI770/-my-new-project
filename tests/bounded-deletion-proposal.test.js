import test from 'node:test';import assert from 'node:assert/strict';
import {requireRecentSignupAuth,markerIsActive,DELETION_MARKER_SECONDS,SIGNUP_AUTH_MAX_AGE_SECONDS,purgeExpiredFirebaseMarkers} from '../server/firebaseDeletionPolicy.js';
test('bounded marker outlasts any signup freshness window, even with old refresh',()=>{
 const deleted=20000;
 for(const delta of [0,1,299,300,3599])assert(markerIsActive(deleted,deleted+delta));
 for(const delta of [3600,3601,10000]){
  assert(!markerIsActive(deleted,deleted+delta));
  // Freshly issued token from a stolen/retained old refresh token is rejected.
  assert.throws(()=>requireRecentSignupAuth({auth_time:deleted,iat:deleted+delta},deleted+delta),/recent_login_required/);
  // New explicit sign-in is permitted, not a permanent rejoin ban.
  requireRecentSignupAuth({auth_time:deleted+delta,iat:deleted+delta},deleted+delta);
 }
 assert(DELETION_MARKER_SECONDS>SIGNUP_AUTH_MAX_AGE_SECONDS);
});
test('requires signed-session original auth time, not token issue time',()=>{
 const now=20000;for(const auth_time of [undefined,'20000',now+1,now-300,now-3600])assert.throws(()=>requireRecentSignupAuth({auth_time,iat:now},now));
 requireRecentSignupAuth({auth_time:now-299},now);
});
test('purge targets only separate proposed Firebase marker table',async()=>{
 let query;await purgeExpiredFirebaseMarkers({asService:fn=>fn({query:q=>{query=q;return {rowCount:1};}})});
 assert.match(query,/delete from auth.firebase_deletion_markers/);assert.match(query,/1 hour/);assert(!query.includes('auth.users'));
});
