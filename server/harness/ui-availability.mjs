// Local fixtures only. Validates editing payload and restored controls; DB
// persistence is separately covered by the Firebase API harness.
import puppeteer from 'puppeteer-core';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4178','--strictPort'],{cwd:process.cwd()+'/app',stdio:['ignore','pipe','pipe']});let browser;
try{await new Promise((r,j)=>{vite.stdout.on('data',d=>{if(d.toString().includes('4178'))r();});vite.stderr.on('data',d=>j(Error(d)));});
browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const page=await browser.newPage();let member=true;let profile={display_name:'Local learner',gender:'man',age_attested_at:'2026-11-07',available_days:['sun','wed'],available_windows:[],study_duration_minutes:null};let saved;
await page.setRequestInterception(true);page.on('request',async r=>{const u=new URL(r.url());if(u.hostname!=='127.0.0.1')return r.abort();
if(u.pathname==='/src/firebase.js')return r.respond({status:200,contentType:'application/javascript',body:`const u={displayName:'Local learner'};export async function initFirebase(){};export function currentFirebaseUser(){return u;}export async function signInWithGoogle(){return u;}export async function signOutFirebase(){};export async function deleteFirebaseUser(){}`});
let data,status=200;if(u.pathname==='/api/auth/providers')data={firebase:{enabled:true,config:{}},email:{enabled:false},demo:{enabled:false}};
else if(u.pathname==='/api/auth/status')data={state:'new'};
else if(u.pathname==='/api/me'){if(!member){status=401;data={error:'authentication_required'};}else data={userId:'local',profile,contactMethods:[]};}
else if(u.pathname==='/api/me/profile'){saved=JSON.parse(r.postData());profile={...profile,available_windows:saved.availableWindows,study_duration_minutes:saved.studyDurationMinutes};data={ok:true};}
else if(u.pathname==='/api/blocks')data={blocks:[]};
else if(u.pathname==='/api/candidates')data={candidates:[{id:'local-other',displayName:'Local only candidate',availableDays:['sun'],availableWindows:[{start:'20:00',end:'21:00'}],studyDurationMinutes:30}]};
else if(u.pathname==='/api/study-requests')data={studyRequests:[]};
if(data)return r.respond({status,contentType:'application/json',body:JSON.stringify(data)});if(u.pathname.startsWith('/api/'))return r.respond({status:200,contentType:'application/json',body:'{}'});r.continue();});
const click=async text=>{for(const b of await page.$$('button'))if((await b.evaluate(e=>e.textContent)).trim()===text){await b.click();return;}throw Error('Missing '+text);};
await page.setViewport({width:320,height:750});await page.goto('http://127.0.0.1:4178/#/me',{waitUntil:'networkidle0'});await click('הוספת טווח שעות');
await page.$$eval('input[type=time]',els=>{for(const [i,v]of ['20:00','21:00'].entries()){const e=els[i];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}});
await page.select('fieldset select','30');await click('שמירת פרופיל');await page.waitForFunction(()=>document.querySelector('[role=status]'));
assert.equal(saved.studyDurationMinutes,30);assert.equal(saved.availableWindows[0].start,'20:00');
await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('fieldset select',e=>e.value),'30');assert.equal(await page.$eval('input[type=time]',e=>e.value),'20:00');
await page.$eval('fieldset',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:'/downloads/chavruta-availability-profile-he.png'});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
await page.goto('http://127.0.0.1:4178/#/find',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.textContent.includes('20:00-21:00'));await page.$eval('.partner-card',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:'/downloads/chavruta-availability-card-he.png'});
member=false;await page.evaluate(()=>localStorage.setItem('chavruta-lang','en'));await page.goto('http://127.0.0.1:4178/#/auth',{waitUntil:'networkidle0'});await page.reload({waitUntil:'networkidle0'});await click('Continue with Google');await page.waitForSelector('fieldset');await page.$eval('fieldset',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:'/downloads/chavruta-availability-signup-en.png'});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
console.log('PASS profile submit and reload restore time/duration; candidate display; signup HE/EN320px fits');
}finally{if(browser)await browser.close();vite.kill();}
