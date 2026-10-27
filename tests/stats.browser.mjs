import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { summarizePlays } from '../shared/stats.js';
const browser=await chromium.launch({headless:true});
const base=process.env.GAME_BASE_URL || 'http://127.0.0.1:7100/';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local tests only');
const saved=new Map(),errors=[];let failSaves=false,leaderboardWrites=0;
async function device(seed=false) {
 const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:900}});let user=null;
 await context.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,body=req.method()==='POST'?req.postDataJSON():null;
  let data={},status=200;
  if(path==='/api/auth/me')data={user};
  else if(path==='/api/auth/login'){user={uid:body.email.startsWith('a@')?'A':'B',email:body.email,displayName:body.email.startsWith('a@')?'玩家A':'玩家B'};data={user};}
  else if(path==='/api/auth/logout'){user=null;data={ok:true};}
  else if(path==='/api/me/stats')data={accountId:user?.uid,...summarizePlays([...(saved.get(user?.uid)?.values()||[])])};
  else if(path==='/api/me/plays') {
   if(failSaves){status=503;data={message:'暂时离线'};}
   else {assert.equal(body.accountId,user.uid);const rows=saved.get(user.uid)||new Map();for(const p of body.plays)if(!rows.has(p.id))rows.set(p.id,p);saved.set(user.uid,rows);data={accountId:user.uid,savedIds:body.plays.map(p=>p.id)};}
  } else if(path==='/api/scores'){leaderboardWrites++;data={duplicate:false};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 if(seed)await page.addInitScript(()=>{if(!localStorage.getItem('gejian:stats'))localStorage.setItem('gejian:stats',JSON.stringify({plays:[{game:'nonogram',size:5,difficulty:'easy',elapsedSeconds:42,gameOver:false,ts:Date.now()}]}));});
 await page.clock.install();await page.goto(`${base}#aim`);await page.locator('#aimStart').waitFor();
 return page;
}
async function login(page,email) {await page.locator('#accountButton').click();await page.locator('#emailInput').fill(email);await page.locator('#passwordInput').fill('testing123');await page.locator('#authSubmitButton').click();await page.waitForFunction(()=>document.querySelector('#accountButtonLabel').textContent.startsWith('玩家'));}
async function count(page,n){await page.waitForFunction(value=>document.querySelector('#statsOverview strong')?.textContent===String(value),n);}
try {
 const a=await device(true);await a.locator('#statsButton').click();await count(a,1);assert.match(await a.locator('#statsSyncState').textContent(),/未登录/);await a.keyboard.press('Escape');
 await login(a,'a@example.test');await a.locator('#statsButton').click();await count(a,0);await a.locator('#statsImportButton').click();await count(a,1);assert.equal(saved.get('A').size,1);await a.keyboard.press('Escape');
 failSaves=true;await a.locator('#aimStart').click();await a.clock.runFor(31000);await a.locator('[data-close-result]').click();await a.locator('#statsButton').click();
 await a.waitForFunction(()=>document.querySelector('#statsSyncState').textContent.includes('1 条待同步'));assert.equal(saved.get('A').size,1);
 failSaves=false;await a.locator('#statsRefreshButton').click();await count(a,2);assert.equal(saved.get('A').size,2);assert.equal(leaderboardWrites,0,'personal history must not automatically submit public scores');
 await a.reload();await a.locator('#statsButton').click();await count(a,2);assert.equal(await a.locator('#statsImportButton').count(),0);
 const b=await device();await login(b,'a@example.test');await b.locator('#statsButton').click();await count(b,2);assert.match(await b.locator('#statsRecentList').textContent(),/瞄准训练/);
 await b.keyboard.press('Escape');await b.locator('#accountButton').click();await b.locator('#signOutButton').click();await b.waitForFunction(()=>document.querySelector('#accountButtonLabel').textContent==='登录');await login(b,'b@example.test');await b.locator('#statsButton').click();await count(b,0);assert.equal(await b.locator('#statsImportButton').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS personal stats: explicit legacy import, automatic game settlement, offline retry, reload, cross-device view and account isolation; no public leaderboard writes.');
} finally {await browser.close();}
