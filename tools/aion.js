import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { remember } from '../server/storage.js';
const root=new URL('../',import.meta.url);
const [command='status',...args]=process.argv.slice(2);
const paths={status:'status',state:'state',watch:'watch',publish:'publish',stop:'stop'};
if(!paths[command] && command!=='remember') { console.error('Usage: node tools/aion.js status|state|watch [--after N]|publish|stop|remember <notes-file>');process.exit(1); }
try {
  if(command==='remember') {
    if(!args[0]) throw Error('Provide a UTF-8 file containing the replacement working notes.');
    console.log(JSON.stringify(await remember(join(fileURLToPath(root),'.aion'),await readFile(args[0],'utf8')),null,2));
  } else {
  const runtime=JSON.parse(await readFile(new URL('.aion/runtime.json',root),'utf8'));
  const after=args.includes('--after')?args[args.indexOf('--after')+1]:'0';
  const response=await fetch(`${runtime.url}/api/${paths[command]}${command==='watch'?`?after=${encodeURIComponent(after)}`:''}`,{
    method:['publish','stop'].includes(command)?'POST':'GET',
    headers:{Authorization:`Bearer ${runtime.token}`,'X-Aion-Client':'1'},
    signal:AbortSignal.timeout(60_000),
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  console.log(JSON.stringify(data,null,2));
  }
} catch(error) { console.error(`Aion: ${error.message}`);process.exitCode=1; }
