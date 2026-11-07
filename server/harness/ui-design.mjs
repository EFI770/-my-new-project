import puppeteer from 'puppeteer-core';
import {spawn} from 'node:child_process';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4177','--strictPort'],{cwd:process.cwd()+'/app',stdio:['ignore','pipe','pipe']});
let browser;
try {
 await new Promise((r,j)=>{vite.stdout.on('data',d=>{if(d.toString().includes('4177'))r();});vite.stderr.on('data',d=>j(new Error(d.toString())));});
 browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();let lang='he';let member=true;
 await page.setRequestInterception(true);
 page.on('request',r=>{
  const u=new URL(r.url());if(u.hostname!=='127.0.0.1')return r.abort();
  if(u.pathname==='/api/me' && !member)return r.respond({status:401,contentType:'application/json',body:'{"error":"authentication_required"}'});
  const data=u.pathname==='/api/auth/providers'?{demo:{enabled:true},email:{enabled:false},firebase:{enabled:false}}:
   u.pathname==='/api/me'?{profile:{display_name:lang==='he'?'אברהם (דמו)':'Avraham (demo)',gender:'man',learning_topics:['משנה','פרשת שבוע'],learning_level:'intermediate',available_days:['sun','wed']}}:
   u.pathname==='/api/candidates'?{candidates:[{id:'synthetic',displayName:lang==='he'?'יעקב (דמו)':'Yaakov (demo)',bio:lang==='he'?'יעקב דמו: מתמקד בהלכה ומשנה, לומד בסדר קבוע.':'Synthetic profile: interested in Halacha and Mishna, with time for a regular learning partner.',learningTopics:['הלכה','משנה'],learningLevel:'advanced',preferredModes:['in_person'],availableDays:['sun','wed'],myInterest:false}]}:null;
  if(data)return r.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
  r.continue();
 });
 for(const [name,width,language] of [['he-mobile',390,'he'],['he-small',320,'he'],['he-desktop',1440,'he'],['en-mobile',390,'en'],['en-desktop',1440,'en']]){
  lang=language;await page.setViewport({width,height:width>800?1000:900});
  await page.goto('http://127.0.0.1:4177/#/find',{waitUntil:'networkidle0'});
  await page.evaluate(l=>localStorage.setItem('chavruta-lang',l),language);await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('.partner-card');
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,cards:document.querySelectorAll('.partner-card').length,headings:[...document.querySelectorAll('h1,h2')].map(x=>x.textContent)}));
  if(layout.overflow)throw new Error('Overflow '+name);console.log(name,JSON.stringify(layout));
  await page.addScriptTag({path:'server/node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));
  console.log('axe',name,JSON.stringify(violations));
  if(violations.length)throw new Error('Accessibility violations '+name);
  await page.screenshot({path:`/downloads/chavruta-warm-${name}.png`,fullPage:false});
  if(width<=390){
    const action=await page.$('.partner-card button');await action.evaluate(el=>el.scrollIntoView({block:'center'}));await action.focus();
    const visible=await action.evaluate(el=>{const b=el.getBoundingClientRect(),nav=document.querySelector('nav').getBoundingClientRect();return b.top>=0 && b.bottom<=nav.top;});
    if(!visible)throw new Error('Card action blocked by fixed nav '+name);
    await page.screenshot({path:`/downloads/chavruta-warm-${name}-action.png`,fullPage:false});
  }
 }
 member=false;lang='he';await page.setViewport({width:390,height:900});
 await page.evaluate(()=>localStorage.setItem('chavruta-lang','he'));
 for(const route of ['auth','']){
  await page.goto('http://127.0.0.1:4177/#/'+route,{waitUntil:'networkidle0'});
  await page.reload({waitUntil:'networkidle0'});
  await page.screenshot({path:`/downloads/chavruta-warm-${route||'landing'}.png`,fullPage:false});
 }
}finally{if(browser)await browser.close();vite.kill('SIGTERM');}
