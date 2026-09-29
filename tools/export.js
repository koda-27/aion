import { mkdir, readdir, copyFile, lstat, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initGame } from '../server/history.js';

const source=fileURLToPath(new URL('..',import.meta.url));
const directories=['client','game','server','shared','tests','tools'];
const files=['package.json','package-lock.json','README.md','PLAY.md','.gitignore','LICENSE','THIRD_PARTY.md'];
async function copyTree(from,to) {
  await mkdir(to,{recursive:true});
  for(const entry of await readdir(from,{withFileTypes:true})) {
    if(entry.name.startsWith('.')) continue;
    if(entry.isSymbolicLink()) throw Error(`Cannot export symlink: ${join(from,entry.name)}`);
    if(entry.isDirectory()) await copyTree(join(from,entry.name),join(to,entry.name));
    else await copyFile(join(from,entry.name),join(to,entry.name));
  }
}
export async function exportSource(root,destination) {
  root=resolve(root);destination=resolve(destination);
  if(destination===root || directories.some(name=>destination===join(root,name)||destination.startsWith(join(root,name)+'/'))) {
    throw Error('Export to a new directory outside the source trees.');
  }
  await mkdir(dirname(destination),{recursive:true});
  await mkdir(destination); // Refuse to overwrite an existing destination.
  for(const name of files) {
    if((await lstat(join(root,name))).isSymbolicLink()) throw Error(`Cannot export symlink: ${name}`);
    await copyFile(join(root,name),join(destination,name));
  }
  for(const name of directories) await copyTree(join(root,name),join(destination,name));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {version}=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
    const destination=resolve(process.argv[2] ?? `dist/aion-${version}`);
    await exportSource(source,destination);
    await initGame(destination);
    console.log(`Publishable source with a fresh game seed commit: ${destination}`);
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
