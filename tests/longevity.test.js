import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ROT from 'rot-js';
import * as game from '../game/index.js';
import { api, acknowledgeArchive } from '../shared/runtime.js';
import { createStorage, remember, maintainNotes } from '../server/storage.js';
import { createSaveQueue } from '../client/save-queue.js';

async function fixture(t) {
  const path=await mkdtemp(join(tmpdir(),'aion-longevity-'));
  t.after(()=>rm(path,{recursive:true,force:true}));
  return path;
}
async function release(path,id) {
  await mkdir(join(path,'releases',id),{recursive:true});
  await writeFile(join(path,'releases',id,'index.js'),'export const abi=1;');
}
const state=()=>({...game.create({ROT,seed:19,...api}),runId:'witness-one'});

test('90 days of saves retain checkpoints and archived petitions without bloating the hot world',async t=>{
  const path=await fixture(t);
  let day=0;
  const now=()=>Date.UTC(2026,0,1+day);
  let store=createStorage(path,{now});
  await store.load();
  const s=state();s.depth=300;
  s.petitions=Array.from({length:200},(_,i)=>({id:`petition-${i}`,depth:i+1,x:3,y:3,request:`Prayer ${i}`,status:'pending'}));
  let firstRelease;
  for(day=0;day<90;day++) {
    const id=`r-${1000000000000+day}-abcd1234`;
    firstRelease ??= id;await release(path,id);
    s.turn=day;
    const saved=await store.commit({release:id,state:s});
    assert.equal(saved.state.petitions.length,64);
    if(day===0) {
      acknowledgeArchive(s,{...s,petitions:[...s.petitions]});
      assert.equal(s.petitions.length,64);
    }
    if(day%10===0) {store=createStorage(path,{now});assert.equal((await store.load()).state.turn,day);}
  }
  assert.equal((await readdir(join(path,'checkpoints'))).length,14);
  const witnesses=await readdir(join(path,'chronicle'));
  const petitions=await readdir(join(path,'chronicle',witnesses[0],'petitions'));
  assert.equal(petitions.length,200);
  await store.pruneReleases({id:`r-${1000000000089}-abcd1234`});
  assert.equal((await readdir(join(path,'releases'))).length,20);
  await assert.rejects(access(join(path,'releases',firstRelease)));
  assert.equal((await createStorage(path,{now}).load()).state.turn,89);
});

test('corrupt current save recovers previous world; backup releases remain pinned beyond retention',async t=>{
  const path=await fixture(t),s=state(),old='r-1000000000000-abcdef01';
  await release(path,old);
  let store=createStorage(path);await store.load();
  await store.commit({release:old,state:s});s.turn=7;
  await store.commit({release:old,state:s});
  for(let i=1;i<=30;i++) await release(path,`r-${1000000000000+i}-abcdef01`);
  await store.pruneReleases({id:'r-1000000000030-abcdef01'});
  await access(join(path,'releases',old,'index.js'));
  await writeFile(join(path,'save.json'),'{broken');
  store=createStorage(path);
  assert.equal((await store.load()).state.turn,0);
  assert.match(store.notices[0],/save-previous/);
  assert.equal((await readdir(join(path,'recovery'))).length,1);
});

test('oversized notes are archived intact and replaced by a bounded handoff; remember keeps prior versions',async t=>{
  const path=await fixture(t),original=Array.from({length:300},(_,i)=>`Observation ${i}`).join('\n');
  await writeFile(join(path,'oracle-notes.md'),original);
  await maintainNotes(path);
  const active=await readFile(join(path,'oracle-notes.md'),'utf8');
  assert.ok(Buffer.byteLength(active)<=8192);assert.ok(active.split('\n').length<=100);
  const [archive]=await readdir(join(path,'notes/archive'));
  assert.equal(await readFile(join(path,'notes/archive',archive),'utf8'),original);
  await remember(path,'# Current facts\nPending source: one feature.\n');
  await assert.rejects(remember(path,'x'.repeat(8193)),/8 KiB/);
  assert.equal((await readdir(join(path,'notes/archive'))).length,2);
});

test('an existing invalid save without a usable fallback is never replaced by a fresh world',async t=>{
  const path=await fixture(t);
  await writeFile(join(path,'save.json'),'null');
  await assert.rejects(createStorage(path).load(),/Invalid save envelope/);
  assert.equal(await readFile(join(path,'save.json'),'utf8'),'null');
});

test('slow save traffic coalesces to latest and an old acknowledgement preserves changed/new-witness petitions',async()=>{
  let unblock;const held=new Promise(resolve=>{unblock=resolve;}),writes=[];
  const queue=createSaveQueue(async value=>{writes.push(value);if(value===0) await held;});
  const draining=queue.enqueue(0);await Promise.resolve();
  for(let i=1;i<=1000;i++) queue.enqueue(i);
  unblock();await draining;assert.deepEqual(writes,[0,1000]);
  const snapshot={runId:'a',depth:99,petitions:Array.from({length:70},(_,id)=>({id,depth:1,status:'pending'}))};
  const live=structuredClone(snapshot);live.petitions[0].status='answered';
  acknowledgeArchive(live,snapshot);assert.equal(live.petitions.length,65);
  assert.equal(live.petitions[0].status,'answered');
  const other=structuredClone(snapshot);other.runId='b';acknowledgeArchive(other,snapshot);
  assert.equal(other.petitions.length,70);
});

test('shrine use survives a reload, but cancellation leaves it available',()=>{
  const s=state();s.enemies=[];s.fires=[];s.slicks=[];
  s.map.forEach((row,y)=>row.forEach((tile,x)=>{if(tile==='s') Object.assign(s.player,{x,y});}));
  const ctx={ROT,...api};
  game.act(s,{type:'interact'},ctx);const prompt=structuredClone(s.prompt);
  game.act(s,{type:'cancel-prompt'},ctx);game.act(s,{type:'interact'},ctx);assert.ok(s.prompt);
  game.act(s,{type:'petition',text:'Hear me.'},ctx);const turn=s.turn;
  const loaded=game.migrate(JSON.parse(JSON.stringify(s)),api);
  loaded.prompt=prompt;game.act(loaded,{type:'petition',text:'Again.'},ctx);
  assert.equal(loaded.petitions.length,1);assert.equal(loaded.turn,turn);
  game.act(loaded,{type:'interact'},ctx);assert.equal(loaded.prompt,null);
});
