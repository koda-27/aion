import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { validateState } from '../shared/runtime.js';
import { atomicJSON, jsonFile, createStorage, maintainNotes } from './storage.js';
import { createHistory } from './history.js';
export { atomicJSON } from './storage.js';

async function copyModules(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name==='.git') continue;
    if (['README.md','LICENSE'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error('Live modules cannot be symlinks');
    if (entry.isDirectory()) await copyModules(join(source,entry.name), join(destination,entry.name));
    else if (entry.name.endsWith('.js')) await writeFile(join(destination,entry.name), await readFile(join(source,entry.name)));
    else throw new Error(`Unsupported live asset ${entry.name}; use JS data exports`);
  }
}

async function checkCandidate(root, candidate, savePath) {
  return new Promise((resolveCheck, reject) => {
    const child = spawn(process.execPath, [join(root,'tools/check-release.js'),candidate, ...(savePath ? ['--save',savePath] : [])], {
      cwd:root, stdio:['ignore','pipe','pipe'], timeout:30_000,
    });
    let output='';
    for (const stream of [child.stdout,child.stderr]) stream.on('data', chunk => { output=(output+chunk).slice(-16000); });
    child.on('error',reject);
    child.on('exit', code => code===0 ? resolveCheck(output.trim()) : reject(new Error(`Candidate rejected: ${output}`)));
  });
}

export async function startBridge({ root, port = 4174, dataDir = join(root,'.aion'), check = checkCandidate, now = Date.now } = {}) {
  await mkdir(join(dataDir,'releases'),{recursive:true});
  // An explicit module boundary also permits isolated test/session data directories.
  await writeFile(join(dataDir,'releases/package.json'),'{"type":"module"}');
  const storage=createStorage(dataDir,{now});
  const history=createHistory(root);
  let saved=await storage.load();
  let latest;
  try {
    latest=await jsonFile(join(dataDir,'latest.json'));
    if(latest) {
      if(!/^r-[0-9]+-[a-f0-9]+$/.test(latest.id) || latest.url!==`/releases/${latest.id}/index.js`) throw Error('Invalid release manifest');
      await stat(join(dataDir,'releases',latest.id,'index.js'));
    }
  } catch(error) {
    if(!saved) throw error;
    latest={id:saved.release,url:`/releases/${saved.release}/index.js`};
    await atomicJSON(join(dataDir,'latest.json'),latest);
    storage.notices.push('Recovered release manifest from the saved descent.');
  }
  await maintainNotes(dataDir);
  let publishing=false, revision=1, lastHeartbeat=0, connected=false, ended=false;
  let owner=null, lease=null, sequence=-1, clientError=null, lastPhase='waiting';
  let saveQueue=Promise.resolve();
  const waiters=new Set();
  const agentToken=randomUUID();

  function phase() {
    if (ended) return 'quit';
    if (!connected) return 'waiting';
    if (now()-lastHeartbeat>300_000) return 'quit';
    if (now()-lastHeartbeat>45_000) return 'away';
    return 'playing';
  }
  function summary() {
    return {
      revision, phase:phase(), publishedRelease:latest?.id ?? null,
      appliedRelease:saved?.release ?? null, publishing, clientError, maintenance:storage.notices,
      heartbeatAgeSeconds:connected?Math.floor((now()-lastHeartbeat)/1000):null,
      game:saved ? {
        turn:saved.state.turn, depth:saved.state.depth, player:saved.state.player,
        recentEvents:saved.state.events.slice(-20), recentMessages:saved.state.messages.slice(-8),
        developments:Object.fromEntries(Object.entries(saved.state.developments ?? {}).slice(-32)),
        developmentCount:Object.keys(saved.state.developments ?? {}).length,
        runId:saved.state.runId ?? 'legacy', petitions:saved.state.petitions?.slice(-8) ?? [],
      } : null,
    };
  }
  function changed() {
    revision++;
    for(const wake of waiters) wake();
    waiters.clear();
  }
  function updatePhase() {
    const current=phase();
    if(current==='quit') ended=true;
    if(current!==lastPhase) { lastPhase=current;changed(); }
  }
  async function publish(bootstrap=false) {
    if(publishing) throw Object.assign(new Error('A candidate is already in flight'),{status:409});
    if(!bootstrap && phase()!=='playing') throw Object.assign(new Error('Player is not active'),{status:409});
    publishing=true;
    const id=`r-${Date.now()}-${randomUUID().slice(0,8)}`;
    const destination=join(dataDir,'releases',id);
    let committed=false;
    try {
      await copyModules(join(root,'game'),destination);
      const checkedSave=join(destination,'validation-save.json');
      // Stable file for validation while ordinary saves continue being accepted.
      if(saved) await atomicJSON(checkedSave,saved);
      try {await check(root,destination,saved?checkedSave:null);}
      finally {await rm(checkedSave,{force:true});}
      if(!bootstrap && phase()!=='playing') throw Object.assign(new Error('Player left during validation'),{status:409});
      const manifest={id, url:`/releases/${id}/index.js`};
      await atomicJSON(join(dataDir,'latest.json'),manifest);
      latest=manifest;committed=true;changed();
      return manifest;
    } finally {
      publishing=false;
      if(!committed) await rm(destination,{recursive:true,force:true});
    }
  }
  if(!latest && saved) {
    latest={id:saved.release,url:`/releases/${saved.release}/index.js`};
    await atomicJSON(join(dataDir,'latest.json'),latest);
  }
  if(!latest) await publish(true);
  await storage.pruneReleases(latest);

  const send=(res,code,data) => {
    res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(data));
  };
  async function body(req) {
    let text='';
    for await (const chunk of req) {
      text+=chunk;
      if(Buffer.byteLength(text)>4_500_000) throw Object.assign(new Error('Request too large'),{status:413});
    }
    return JSON.parse(text || '{}');
  }
  function requireAgent(req) {
    const received=Buffer.from(req.headers.authorization ?? '');
    const expected=Buffer.from(`Bearer ${agentToken}`);
    if(received.length!==expected.length || !timingSafeEqual(received,expected)) {
      throw Object.assign(new Error('Agent authorization required'),{status:403});
    }
  }
  function requireLease(req,allowEnded=false) {
    if(!lease || req.headers['x-aion-lease']!==lease || (!allowEnded&&phase()==='quit')) {
      throw Object.assign(new Error('This browser does not own the session'),{status:409});
    }
  }
  let address;
  const server=http.createServer(async(req,res)=>{
    try {
      // Loopback binding + exact Host/Origin checks + custom write header prevent
      // an unrelated website from driving this local development service.
      if(!address || req.headers.host!==new URL(address).host) return send(res,403,{error:'Unexpected host'});
      if(req.headers.origin && req.headers.origin!==address) return send(res,403,{error:'Unexpected origin'});
      const url=new URL(req.url,address);
      updatePhase();
      if(req.method==='POST' && req.headers['x-aion-client']!=='1') return send(res,403,{error:'Write header required'});
      if(url.pathname==='/api/status' && req.method==='GET') return send(res,200,summary());
      if(url.pathname==='/api/state' && req.method==='GET') { requireAgent(req);return send(res,200,{...summary(),save:saved}); }
      if(url.pathname==='/api/release' && req.method==='GET') return send(res,200,latest);
      if(url.pathname==='/api/history' && req.method==='GET') {
        requireLease(req,true);return send(res,200,await history.history(Number(url.searchParams.get('offset') ?? 0)));
      }
      if(url.pathname==='/api/watch' && req.method==='GET') {
        requireAgent(req);
        const after=Number(url.searchParams.get('after') ?? 0);
        if(revision<=after && phase()!=='quit') await new Promise(resolveWait=>{
          let timer;
          const done=()=>{ clearTimeout(timer);waiters.delete(done);res.off('close',done);resolveWait(); };
          waiters.add(done);timer=setTimeout(done,25_000);res.on('close',done);
        });
        if(!res.destroyed) send(res,200,summary());
        return;
      }
      if(url.pathname==='/api/connect' && req.method==='POST') {
        const data=await body(req);
        await saveQueue;
        if(ended || phase()==='quit') return send(res,409,{error:'Session ended. Restart the server to resume.'});
        if(typeof data.clientId!=='string' || data.clientId.length>100) return send(res,400,{error:'Invalid client identity'});
        if(owner && owner!==data.clientId && phase()==='playing') return send(res,409,{error:'Another tab is playing this descent.'});
        owner=data.clientId;lease=randomUUID();
        sequence=-1;connected=true;lastHeartbeat=now();clientError=null;changed();
        return send(res,200,{lease,save:saved,release:latest});
      }
      if(['/api/save','/api/heartbeat','/api/quit','/api/client-error'].includes(url.pathname) && req.method==='POST') {
        requireLease(req);
        const data=await body(req);
        requireLease(req);
        lastHeartbeat=now();
        if(url.pathname==='/api/heartbeat') { updatePhase();return send(res,200,{phase:phase()}); }
        if(url.pathname==='/api/client-error') { clientError=data.error===null?null:String(data.error).slice(0,4000);changed();return send(res,200,{ok:true}); }
        if(url.pathname==='/api/quit') {
          await saveQueue;ended=true;changed();return send(res,200,{ok:true});
        }
        if(!Number.isInteger(data.sequence) || typeof data.release!=='string' || !/^r-[0-9]+-[a-f0-9]+$/.test(data.release)) {
          return send(res,400,{error:'Invalid save envelope'});
        }
        validateState(data.state);
        // Serialize save commits; a slow older disk write cannot win the race.
        const commit=saveQueue.then(async()=>{
          requireLease(req);
          if(data.sequence<=sequence) return;
          await stat(join(dataDir,'releases',data.release,'index.js'));
          const next={state:data.state,release:data.release};
          saved=await storage.commit(next);sequence=data.sequence;changed();
        });
        saveQueue=commit.catch(()=>{});
        await commit;return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/publish' && req.method==='POST') {
        requireAgent(req);return send(res,200,await publish());
      }
      if(url.pathname==='/api/stop' && req.method==='POST') {
        requireAgent(req);ended=true;changed();await saveQueue;
        send(res,200,{ok:true});setImmediate(()=>server.close());return;
      }
      if(req.method!=='GET') return send(res,405,{error:'Method not allowed'});
      let path;
      if(url.pathname==='/') path=join(root,'client/index.html');
      else if(url.pathname==='/vendor/rot.js') path=join(root,'node_modules/rot-js/dist/rot.js');
      else if(/^\/(client|shared)\/[a-zA-Z0-9_/-]+\.(js|css)$/.test(url.pathname)) path=join(root,url.pathname.slice(1));
      else if(/^\/releases\/r-[0-9]+-[a-f0-9]+\/[a-zA-Z0-9_/-]+\.js$/.test(url.pathname)) path=join(dataDir,url.pathname.slice(1));
      else return send(res,404,{error:'Not found'});
      const bytes=await readFile(path);
      res.writeHead(200,{
        'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[extname(path)],
        'Cache-Control':url.pathname.startsWith('/releases/')?'public, max-age=31536000, immutable':'no-store',
        'X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(bytes);
    } catch(error) {
      if(!res.headersSent && !res.destroyed) send(res,error.status ?? (error.code==='ENOENT'?404:400),{error:error.message});
    }
  });
  await new Promise((resolveListen,reject)=>{
    const listenError=(error)=>{
      if(error.code==='EADDRINUSE' && port!==0) { port=0;server.listen(0,'127.0.0.1'); }
      else reject(error);
    };
    server.on('error',listenError);
    server.listen(port,'127.0.0.1',()=>{server.off('error',listenError);resolveListen();});
  });
  address=`http://127.0.0.1:${server.address().port}`;
  const runtime={url:address,token:agentToken,pid:process.pid,root:resolve(root)};
  await atomicJSON(join(dataDir,'runtime.json'),runtime);
  const ticker=setInterval(updatePhase,5000);ticker.unref();
  server.on('close',()=>{clearInterval(ticker);for(const wake of waiters) wake();});
  return {server,runtime,summary,dataDir,close:async()=>{
    ended=true;changed();await saveQueue;
    await new Promise(resolveClose=>server.close(resolveClose));
  }};
}
