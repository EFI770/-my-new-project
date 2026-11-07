// Local UI test doubles only. No Firebase configuration or vendor requests.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4176', '--strictPort'], {cwd: process.cwd() + '/app', stdio:['ignore','pipe','pipe']});
let browser;
try {
  await new Promise((resolve,reject) => {
    vite.stdout.on('data', d => { if (d.toString().includes('4176')) resolve(); });
    vite.stderr.on('data', d => reject(new Error(d.toString())));
    vite.on('exit', code => reject(new Error(`vite exited ${code}`)));
  });
  browser = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page = await browser.newPage();
  await page.setViewport({width:360,height:800});
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname !== '127.0.0.1') return r.abort();
    if (u.pathname === '/src/firebase.js') return r.respond({status:200,contentType:'application/javascript',body:`
      const user = {displayName:'Synthetic learner'};
      window.fixture = {pending:true,failDelete:true};
      export async function initFirebase() {}
      export function currentFirebaseUser() {return window.fixture.pending ? user : null;}
      export async function signInWithGoogle() {window.fixture.pending=true;return user;}
      export async function signOutFirebase() {window.fixture.pending=false;}
      export async function deleteFirebaseUser() {if(window.fixture.failDelete)throw new Error('synthetic popup cancelled');window.fixture.pending=false;}
    `});
    if (u.pathname === '/api/auth/providers') return r.respond({status:200,contentType:'application/json',body:JSON.stringify({firebase:{enabled:true,config:{projectId:'synthetic'}},email:{enabled:false},demo:{enabled:false}})});
    if (u.pathname.startsWith('/api/')) return r.respond({status:401,contentType:'application/json',body:'{"error":"authentication_required"}'});
    r.continue();
  });
  const clickText = async (text) => {
    const buttons = await page.$$('button');
    for(const b of buttons) if((await b.evaluate(e=>e.textContent)).trim()===text) {await b.click();return;}
    throw new Error(`missing button ${text}`);
  };
  const assert = (condition,name) => {if(!condition)throw new Error(name);console.log(`ok - ${name}`);};
  await page.goto('http://127.0.0.1:4176/#/auth',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.body.textContent.includes('מחיקת רשומת הכניסה'));
  await clickText('מחיקת רשומת הכניסה');
  await page.waitForSelector('[role="alert"]');
  assert((await page.$eval('[role="alert"]',e=>e.textContent)).includes('מפעיל הקהילה'),'cancelled retry shows persistent support error');
  assert(!await page.$('input[type="password"]'),'Google-only screen has no password form');
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'/downloads/firebase-retry-he.png',fullPage:false});
  await clickText('EN');
  await page.setViewport({width:320,height:800});
  await clickText('Remove sign-in record');
  await page.waitForFunction(()=>document.querySelector('[role=alert]')?.textContent.includes('community operator'));
  await page.screenshot({path:'/downloads/firebase-retry-en.png',fullPage:false});
  const overflows = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert(!overflows,'English recovery screen fits 320px');
  await page.evaluate(()=>window.fixture.failDelete=false);
  await clickText('Remove sign-in record');
  await page.waitForFunction(()=>!document.body.textContent.includes('An active Google sign-in record'));
  assert(!await page.$('[role="alert"]'),'successful retry clears error');
  await clickText('Continue with Google');
  await page.waitForFunction(()=>document.body.textContent.includes('You signed in with Google.'));
  assert(!await page.$eval('button',()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Continue with Google').disabled),'popup success resets busy flag despite early return');
  assert(!await page.$('input[type="password"]'),'Google signup has no password field');
  await page.waitForFunction(()=>!document.querySelector('[role=status]'));
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'/downloads/firebase-signup-en.png',fullPage:false});
  console.log('PASS local UI synthetic retry, cancellation, signup, busy state');
} finally {
  if(browser)await browser.close();
  vite.kill('SIGTERM');
}
