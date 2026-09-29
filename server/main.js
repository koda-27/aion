import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startBridge } from './bridge.js';
import { initGame } from './history.js';

const root=fileURLToPath(new URL('..',import.meta.url));
try {
  const old=JSON.parse(await readFile(join(root,'.aion/runtime.json'),'utf8'));
  const response=await fetch(`${old.url}/api/state`,{
    headers:{Authorization:`Bearer ${old.token}`},signal:AbortSignal.timeout(1000),
  });
  if(response.ok) throw new Error(`Aion is already running at ${old.url}`);
} catch(error) {
  if(error.message.startsWith('Aion is already')) { console.error(error.message);process.exit(1); }
}
try {await initGame(root);} catch(error) {console.error(`Game history unavailable: ${error.message}`);}
const bridge=await startBridge({root,port:Number(process.env.PORT ?? 4174)});
for(const notice of bridge.summary().maintenance) console.error(notice);
console.log(`Aion: ${bridge.runtime.url}`);
console.log('Local descent ready. The Oracle is your terminal agent; no model service was started.');
let closing=false;
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{
  if(closing) return;closing=true;await bridge.close();
});
