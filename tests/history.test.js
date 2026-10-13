import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHistory, initGame, run } from '../server/history.js';

test('a fresh game gets one seed commit, and an existing history is left alone',async t=>{
  const root=await mkdtemp(join(tmpdir(),'aion-history-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const service=createHistory(root);
  await mkdir(join(root,'game'));
  for(const name of ['index.js','README.md','LICENSE']) await writeFile(join(root,'game',name),'seed\n');
  await assert.rejects(service.history(),/Game history is unavailable/);
  assert.equal((await initGame(root)).created,true);
  assert.equal(await run('git',['rev-list','--count','HEAD'],join(root,'game')),'1');
  assert.equal(await run('git',['tag','--list'],join(root,'game')),'aion-seed');
  const history=await service.history();
  assert.equal(history.commits[0].subject,'Seed the dungeon');assert.equal(history.dirty,false);
  assert.equal((await service.history(30)).commits.length,0);
  await assert.rejects(service.history(-1),/Invalid history/);
  assert.equal((await initGame(root)).created,false);
  assert.equal(await run('git',['rev-list','--count','HEAD'],join(root,'game')),'1');
});
