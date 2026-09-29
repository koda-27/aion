import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ROT from 'rot-js';
import * as game from '../game/index.js';
import { api, migrateWorld, validateModule } from '../shared/runtime.js';
import { startBridge } from '../server/bridge.js';

const root=fileURLToPath(new URL('..',import.meta.url));

test('migration rejection leaves the actual run untouched',()=>{
  const state=game.create({ROT,seed:19,...api}),before=structuredClone(state);
  assert.throws(()=>migrateWorld({...game,migrate(draft){draft.player.hp=0;throw Error('broken migration');}},state));
  assert.deepEqual(state,before);
  const next=migrateWorld({...game,migrate(draft){draft.player.oil+=7;return draft;}},state);
  assert.equal(next.player.oil,state.player.oil+7);
  assert.deepEqual(state,before);
});

test('publication, save ordering, observation, quit and restart',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'aion-bridge-'));
  let rejectCandidate=false,clock=Date.now();
  const check=async(_root,path)=>{
    if(rejectCandidate) throw Error('broken candidate');
    validateModule(await import(pathToFileURL(join(path,'index.js'))));
  };
  let bridge;
  try {
    bridge=await startBridge({root,port:0,dataDir,check,now:()=>clock});
    const {url,token}=bridge.runtime;
    let lease;
    const call=async(path,data,headers={})=>{
      const response=await fetch(`${url}/api/${path}`,{method:data===undefined?'GET':'POST',
        headers:{'X-Aion-Client':'1','Authorization':`Bearer ${token}`,...(lease?{'X-Aion-Lease':lease}:{}),...headers},
        ...(data===undefined?{}:{body:JSON.stringify(data)})});
      return {status:response.status,body:await response.json()};
    };
    assert.equal((await call('status')).body.phase,'waiting');
    assert.equal((await call('publish',{})).status,409);
    assert.equal((await fetch(`${url}/PLAY.md`)).status,404);
    assert.equal((await call('history')).status,409);
    assert.equal((await call('connect',{clientId:'test'},{Origin:'https://elsewhere.invalid'})).status,403);
    const connection=(await call('connect',{clientId:'test'})).body;lease=connection.lease;
    assert.equal((await call('connect',{clientId:'other'})).status,409);
    const state=game.create({ROT,seed:47,...api});
    assert.equal((await call('save',{state,release:connection.release.id,sequence:1})).status,200);
    const current=(await call('status')).body;
    const watching=call(`watch?after=${current.revision}`);
    state.player.silver=11;state.turn=3;
    await call('save',{state,release:connection.release.id,sequence:3});
    assert.equal((await watching).body.game.player.silver,11);
    state.player.silver=0;
    await call('save',{state,release:connection.release.id,sequence:2});
    assert.equal((await call('state')).body.save.state.player.silver,11);
    rejectCandidate=true;
    assert.equal((await call('publish',{})).status,400);
    assert.equal((await call('status')).body.publishedRelease,connection.release.id);
    rejectCandidate=false;
    const published=await call('publish',{});
    assert.equal(published.status,200);assert.notEqual(published.body.id,connection.release.id);
    assert.equal((await call('state')).body.save.state.turn,3);
    assert.equal((await fetch(`${url}${published.body.url}`)).status,200);
    clock+=46_000;
    assert.equal((await call('status')).body.phase,'away');
    assert.equal((await call('publish',{})).status,409);
    await call('heartbeat',{});
    assert.equal((await call('quit',{})).status,200);
    assert.equal((await call('status')).body.phase,'quit');
    assert.equal((await call('publish',{})).status,409);
    assert.equal(JSON.parse(await readFile(join(dataDir,'save.json'),'utf8')).state.player.silver,11);
    await bridge.close();
    bridge=await startBridge({root,port:0,dataDir,check});
    assert.equal(bridge.summary().game.player.silver,11);
    assert.equal(bridge.summary().publishedRelease,published.body.id);
    assert.equal(bridge.summary().phase,'waiting');
  } finally {await bridge?.close();await rm(dataDir,{recursive:true,force:true});}
});
