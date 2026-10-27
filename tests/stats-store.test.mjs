import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStatsStore } from '../src/core/stats-store.js';
import { summarizePlays } from '../shared/stats.js';
const round={game:'nonogram',size:5,difficulty:'easy',elapsedSeconds:10};
function setup() {
  const values = new Map(), saved = new Map(), writes=[];
  let user = null, offline = false;
  const api = {
    async savePlays(accountId,plays) {
      writes.push({accountId,plays});
      if(offline)throw new Error('offline');
      if(user?.uid!==accountId)throw new Error('account-changed');
      const rows = saved.get(accountId)||new Map();for(const p of plays) if(!rows.has(p.id))rows.set(p.id,p);saved.set(accountId,rows);
      return {accountId,savedIds:plays.map(p=>p.id)};
    },
    async loadStats() {if(offline)throw new Error('offline');return {accountId:user.uid,...summarizePlays([...(saved.get(user.uid)?.values()||[])])};}
  };
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const store=createStatsStore({storage,getUser:()=>user,api});
  return {store,api,values,saved,writes,storage,getUser:()=>user,setUser:id=>{user=id?{uid:id}:null;},setOffline:v=>{offline=v;}};
}
test('guest history stays local; explicit import is idempotent and another device reads account history',async()=>{
 const f=setup();f.store.recordPlay(round,false);await f.store.refresh();assert.equal(f.writes.length,0);assert.equal(f.store.getSnapshot().summary.total,1);
 f.setUser('A');await f.store.refresh();assert.equal(f.store.getSnapshot().summary.total,0);assert.equal(f.store.getSnapshot().guestCount,1);
 await f.store.importGuest();await f.store.importGuest();assert.equal(f.saved.get('A').size,1);assert.equal(f.store.getSnapshot().guestCount,0);
 const other=createStatsStore({storage:{getItem:()=>null,setItem(){}},getUser:f.getUser,api:f.api});await other.refresh();assert.equal(other.getSnapshot().summary.total,1);
});
test('offline queue survives reload, is never sent to a different account, and retries without duplicates',async()=>{
 const f=setup();f.setUser('A');await f.store.refresh();f.setOffline(true);f.store.recordPlay(round,false);await f.store.refresh();assert.equal(f.store.getSnapshot().pending,1);
 f.setUser('B');f.setOffline(false);await f.store.refresh();assert.equal(f.store.getSnapshot().pending,0);assert.equal(f.store.getSnapshot().summary.total,0);assert.equal(f.saved.has('B'),false);
 f.setUser('A');const reloaded=createStatsStore({storage:f.storage,getUser:f.getUser,api:f.api});await reloaded.refresh();assert.equal(reloaded.getSnapshot().summary.total,1);assert.equal(reloaded.getSnapshot().pending,0);await reloaded.refresh();assert.equal(f.saved.get('A').size,1);
});
test('an old response cannot clear a new account queue or replace its displayed history',async()=>{
 const f=setup();f.setUser('A');await f.store.refresh();
 let complete;const normalSave=f.api.savePlays;f.api.savePlays=(uid,plays)=>uid==='A'?new Promise(resolve=>{complete=()=>resolve({accountId:uid,savedIds:plays.map(p=>p.id)});}):normalSave(uid,plays);
 f.store.recordPlay(round,false);assert.ok(complete);f.setUser('B');await f.store.refresh();f.store.recordPlay({...round,elapsedSeconds:20},false);await f.store.refresh();complete();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.store.getSnapshot().accountId,'B');assert.equal(f.store.getSnapshot().summary.totalSeconds,20);assert.equal(f.saved.get('B').size,1);
});
test('old local records get stable IDs, invalid records remain local, and failed rounds do not become personal bests',async()=>{
 const f=setup();f.values.set('gejian:stats',JSON.stringify({plays:[{...round,ts:Date.now(),gameOver:false},{...round,ts:Date.now(),gameOver:true,elapsedSeconds:0},{game:'invalid'}]}));
 await f.store.refresh();const ids=f.store.getSnapshot().recent.map(p=>p.id);await f.store.refresh();assert.deepEqual(f.store.getSnapshot().recent.map(p=>p.id),ids);assert.equal(f.store.getSnapshot().summary.wins,1);assert.equal(f.store.getSnapshot().invalidGuestCount,1);
 f.setUser('A');await f.store.refresh();await f.store.importGuest();assert.equal(f.saved.get('A').size,2);assert.equal(JSON.parse(f.values.get('gejian:stats')).plays.length,1);
});
test('a record added while an upload is pending is not lost during acknowledgement',async()=>{
 const f=setup();f.setUser('A');await f.store.refresh();let complete;const normalSave=f.api.savePlays;let first=true;
 f.api.savePlays=async(uid,plays)=>{if(first){first=false;await new Promise(resolve=>{complete=resolve;});}return normalSave(uid,plays);};
 f.store.recordPlay(round,false);f.store.recordPlay(round,false);complete();await f.store.refresh();assert.equal(f.saved.get('A').size,2);assert.equal(f.store.getSnapshot().pending,0);
});
test('storage failure during import reserves records for their chosen account across reloads',async()=>{
 const f=setup();f.store.recordPlay(round,false);await f.store.refresh();f.setUser('A');await f.store.refresh();
 const original=f.storage.setItem;f.storage.setItem=(key,value)=>{if(key.includes(':pending:'))throw new Error('quota');original(key,value);};
 await f.store.importGuest();assert.equal(f.saved.size,0);
 f.setUser('B');const b=createStatsStore({storage:f.storage,getUser:f.getUser,api:f.api});await b.refresh();assert.equal(b.getSnapshot().guestCount,0);
 f.storage.setItem=original;f.setUser('A');const a=createStatsStore({storage:f.storage,getUser:f.getUser,api:f.api});await a.refresh();assert.equal(a.getSnapshot().guestCount,1);await a.importGuest();assert.equal(f.saved.get('A').size,1);
});
