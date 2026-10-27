import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../server/app.js';
test('production static handler serves HTML/assets with CSP and does not expose source or secrets',async t=>{
 const root=await mkdtemp(join(tmpdir(),'gejian-http-'));
 await mkdir(join(root,'assets'));await writeFile(join(root,'index.html'),'<!doctype html><div id="root"></div>');await writeFile(join(root,'assets/index-abcdefgh.js'),'console.log("ok")');
 const app=await buildApp({pool:{query:async()=>[]},secure:true,staticRoot:root});
 t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 for(const method of ['GET','HEAD']){
  const response=await app.inject({method,url:'/',headers:{'x-forwarded-for':'192.0.2.1','x-forwarded-proto':'https'}});
  assert.equal(response.statusCode,200);assert.match(response.headers['content-type'],/text\/html/);assert.equal(response.headers['cache-control'],'no-cache');assert.match(response.headers['content-security-policy'],/script-src 'self'/);
 }
 assert.match((await app.inject({url:'/assets/index-abcdefgh.js'})).headers['cache-control'],/immutable/);
 for(const url of ['/.env','/server/app.js','/private/hash-config.json','/../package.json'])assert.equal((await app.inject({url})).statusCode,404);
 assert.equal((await app.inject({url:'/api/health'})).json().status,'ok');
});
test('auth limit rejects repeated attempts and separates client IPs from the trusted proxy',async t=>{
 const app=await buildApp({pool:{query:async()=>[]},serveStatic:false});t.after(()=>app.close());
 const attempt=ip=>app.inject({method:'POST',url:'/api/auth/login',payload:{},headers:{'x-gejian-request':'1','x-forwarded-for':ip}});
 for(let i=0;i<20;i++)assert.equal((await attempt('192.0.2.10')).statusCode,400);
 assert.equal((await attempt('192.0.2.10')).statusCode,429);
 assert.equal((await attempt('192.0.2.11')).statusCode,400);
});
