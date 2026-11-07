import puppeteer from 'puppeteer-core';
import {spawn} from 'node:child_process';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4178','--strictPort'],{cwd:process.cwd()+'/app',stdio:['ignore','pipe','pipe']});
let browser;
try{
await new Promise((r,j)=>{vite.stdout.on('data',d=>{if(d.toString().includes('4178'))r();});vite.stderr.on('data',d=>j(new Error(d.toString())));});
browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();
await p.setRequestInterception(true);p.on('request',r=>{const u=new URL(r.url());if(u.hostname!=='127.0.0.1')return r.abort();if(u.pathname.startsWith('/api/'))return r.respond({status:401,contentType:'application/json',body:'{}'});r.continue();});
for(const route of ['privacy','accessibility']){await p.setViewport({width:390,height:900});await p.goto('http://127.0.0.1:4178/#/'+route,{waitUntil:'networkidle0'});await p.waitForSelector('h1');
const text=await p.$eval('main',e=>e.innerText).catch(()=>p.evaluate(()=>document.body.innerText));
if(!text.includes('Draft for review only')||text.includes('fewer than 25')||text.includes('database and identity service are operated by Neon'))throw new Error('stale legal copy '+route);
if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('overflow '+route);
await p.addScriptTag({path:'server/node_modules/axe-core/axe.min.js'});const v=await p.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(x=>({id:x.id,impact:x.impact})));console.log(route,'axe=',JSON.stringify(v));if(v.length)throw new Error('axe '+route);
await p.screenshot({path:'/downloads/chavruta-legal-'+route+'.png',fullPage:true});console.log('PASS draft, no stale claims, no overflow:',route);
}
}finally{if(browser)await browser.close();vite.kill('SIGTERM');}
