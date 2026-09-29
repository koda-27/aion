import { cp, readFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportSource } from './export.js';

const root=fileURLToPath(new URL('..',import.meta.url));
try {
  let runtime;
  try {runtime=JSON.parse(await readFile(join(root,'.aion/runtime.json'),'utf8'));}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  if(runtime) {
    let alive=false;
    try {alive=(await fetch(`${runtime.url}/api/status`,{signal:AbortSignal.timeout(1500)})).ok;} catch {}
    if(alive) throw Error('Stop Aion before making a full backup: node tools/aion.js stop');
  }
  const destination=resolve(process.argv[2] ?? `.aion/backups/manual-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  const dataDir=join(root,'.aion');
  if(destination===dataDir || (destination.startsWith(dataDir+'/')&&!destination.startsWith(join(dataDir,'backups')+'/'))) {
    throw Error('Inside .aion, backup destinations must be under .aion/backups/.');
  }
  await exportSource(root,destination);
  try {await cp(join(root,'game/.git'),join(destination,'game/.git'),{recursive:true});}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  await mkdir(join(destination,'.aion'),{recursive:true});
  // Copy siblings individually: fs.cp rejects a directory-to-descendant copy
  // even when a filter would exclude the destination's parent.
  for(const entry of await readdir(dataDir,{withFileTypes:true})) {
    if(['backups','runtime.json'].includes(entry.name)||entry.name.endsWith('.tmp')) continue;
    if(entry.isSymbolicLink()) throw Error(`Cannot back up runtime symlink: ${entry.name}`);
    await cp(join(dataDir,entry.name),join(destination,'.aion',entry.name),{recursive:true});
  }
  console.log(`Private backup: ${destination}\nRestore into a separate directory, run npm ci, then npm start.`);
} catch(error) {console.error(error.message);process.exitCode=1;}
