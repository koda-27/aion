import { readFile, writeFile, mkdir, rename, rm, readdir, open } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { validateState, retainedPetitions } from '../shared/runtime.js';

export const releasePattern=/^r-[0-9]+-[a-f0-9]+$/;
const hash=value=>createHash('sha256').update(value).digest('hex');

export async function atomicWrite(path, text) {
  await mkdir(dirname(path),{recursive:true});
  const temp=`${path}.${randomUUID()}.tmp`;
  try {
    const file=await open(temp,'wx',0o600);
    try {await file.writeFile(text);await file.sync();} finally {await file.close();}
    await rename(temp,path);
  } finally {await rm(temp,{force:true});}
}
export const atomicJSON=(path,value)=>atomicWrite(path,JSON.stringify(value));
export async function jsonFile(path, fallback=null) {
  try {return JSON.parse(await readFile(path,'utf8'));}
  catch(error) {if(error.code==='ENOENT') return fallback;throw error;}
}
async function entries(path) {
  try {return await readdir(path);} catch(error) {if(error.code==='ENOENT') return [];throw error;}
}

export const NOTES_BYTES=8192, NOTES_LINES=100;
export async function remember(dataDir,text) {
  if(Buffer.byteLength(text)>NOTES_BYTES || text.split('\n').length>NOTES_LINES) {
    throw new Error('Working notes must fit 8 KiB and 100 lines. Summarize current facts; history belongs in Git and the archive.');
  }
  const path=join(dataDir,'oracle-notes.md');
  let previous='';
  try {previous=await readFile(path,'utf8');} catch(error) {if(error.code!=='ENOENT') throw error;}
  if(previous===text) return {changed:false};
  let archive=null;
  if(previous) {
    archive=`notes/archive/${hash(previous)}.md`;
    await atomicWrite(join(dataDir,archive),previous);
  }
  await atomicWrite(path,text);
  return {changed:true,archive};
}

export async function maintainNotes(dataDir) {
  const path=join(dataDir,'oracle-notes.md');
  let text;
  try {text=await readFile(path,'utf8');} catch(error) {if(error.code==='ENOENT') return;throw error;}
  if(Buffer.byteLength(text)<=NOTES_BYTES && text.split('\n').length<=NOTES_LINES) return;
  const archive=`notes/archive/${hash(text)}.md`;
  // Preserve everything first. This is a bounded handoff, not a guessed summary.
  await remember(dataDir,`# Oracle working memory\n\nThe previous notes exceeded the working-memory limit and were archived intact.\nRead targeted sections of .aion/${archive} once to reconcile pending source,\ncurrent defects and promises, then replace this handoff using the remember command.\nVerify against status and Git; old observations may be stale.\n\n## Tail of previous notes (not a summary)\n${text.split('\n').slice(-25).join('\n').slice(-3000)}\n`);
}

export function createStorage(dataDir,{now=Date.now}={}) {
  let current=null,checkpointDay=null;
  const archiveCache=new Map();
  const notices=[];
  const backupsDir=join(dataDir,'checkpoints');

  async function loadEnvelope(path) {
    let text;
    try {text=await readFile(path,'utf8');} catch(error) {if(error.code==='ENOENT') return null;throw error;}
    const value=JSON.parse(text);
    if(!value || typeof value!=='object') throw new Error(`Invalid save envelope in ${path}`);
    if(!releasePattern.test(value.release)) throw new Error(`Invalid release in ${path}`);
    validateState(value.state);
    await readFile(join(dataDir,'releases',value.release,'index.js'));
    return value;
  }
  async function archive(path,value) {
    const text=JSON.stringify(value),digest=hash(text);
    if(archiveCache.get(path)===digest) return;
    await atomicWrite(join(dataDir,'chronicle',path),text);
    archiveCache.set(path,digest);
    if(archiveCache.size>256) archiveCache.delete(archiveCache.keys().next().value);
  }
  async function record(state) {
    // Hash keys before using them as paths; player and live-module text is data.
    const witness=hash(String(state.runId ?? 'legacy'));
    for(const petition of state.petitions ?? []) {
      await archive(`${witness}/petitions/${hash(String(petition.id))}.json`,petition);
    }
    await archive(`${witness}/witness.json`,{
      runId:state.runId ?? 'legacy',turn:state.turn,depth:state.depth,
      player:state.player,history:state.history ?? [],updatedAt:new Date(now()).toISOString(),
    });
  }
  async function checkpoint(value) {
    const day=new Date(now()).toISOString().slice(0,10);
    if(checkpointDay===day || !value) return;
    const path=join(backupsDir,`${day}.json`);
    // The first saved position each UTC day is immutable for that day.
    if(!(await entries(backupsDir)).includes(`${day}.json`)) await atomicJSON(path,value);
    checkpointDay=day;
    const names=(await entries(backupsDir)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
    for(const name of names.slice(14)) await rm(join(backupsDir,name));
  }
  async function load() {
    const primary=join(dataDir,'save.json');
    let primaryError;
    try {current=await loadEnvelope(primary);} catch(error) {primaryError=error;}
    if(!current) {
      const candidates=['save-previous.json',...(await entries(backupsDir)).sort().reverse().map(n=>`checkpoints/${n}`)];
      for(const name of candidates) {
        try {current=await loadEnvelope(join(dataDir,name));} catch {continue;}
        if(current) {
          if(primaryError) {
            await mkdir(join(dataDir,'recovery'),{recursive:true});
            await rename(primary,join(dataDir,'recovery',`save-${Date.now()}-${randomUUID()}.json`));
          }
          await atomicJSON(primary,current);
          notices.push(`Recovered saved descent from ${name}.`);break;
        }
      }
      if(!current && primaryError) throw primaryError;
    }
    if(current) {await record(current.state);await checkpoint(current);}
    return current;
  }
  async function commit(value) {
    // Archive before pruning. Failed archival must leave the original save intact.
    await record(value.state);
    await checkpoint(current ?? value);
    const next={...value,state:{...value.state,petitions:retainedPetitions(value.state)}};
    if(current) await atomicJSON(join(dataDir,'save-previous.json'),current);
    await atomicJSON(join(dataDir,'save.json'),next);
    current=next;
    return next;
  }
  async function pruneReleases(latest) {
    // Called only at startup, before any browser can be importing an old release.
    const pinned=new Set([latest?.id,current?.release]);
    const previous=await jsonFile(join(dataDir,'save-previous.json')).catch(()=>null);
    if(previous) pinned.add(previous.release);
    for(const name of await entries(backupsDir)) {
      const value=await jsonFile(join(backupsDir,name)).catch(()=>null);
      if(value) pinned.add(value.release);
    }
    const releases=(await entries(join(dataDir,'releases'))).filter(n=>releasePattern.test(n)).sort().reverse();
    for(const id of releases.slice(20)) {
      if(!pinned.has(id)) await rm(join(dataDir,'releases',id),{recursive:true,force:true});
    }
    return {retained:releases.filter(id=>pinned.has(id)||releases.indexOf(id)<20).length};
  }
  return {load,commit,pruneReleases,notices};
}
