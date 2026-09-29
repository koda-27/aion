import { api, validateState, validateModule, migrateWorld, acknowledgeArchive } from '/shared/runtime.js';
import { Audio } from './audio.js';
import { createSaveQueue } from './save-queue.js';
import { setupHistory } from './history.js';

const $=id=>document.getElementById(id);
const canvas=$('dungeon'),ctx=canvas.getContext('2d'),audio=new Audio();
const ROT=window.ROT;
const directions={ArrowUp:[0,-1],ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0],
  w:[0,-1],d:[1,0],s:[0,1],a:[-1,0],k:[0,-1],l:null,j:[0,1],h:null,
  y:[-1,-1],u:[1,-1],b:[-1,1],n:[1,1]};
let state,mod,release,lease,sequence=0,saveError=null;
const saveQueue=createSaveQueue(async snapshot=>{
  await request('save',snapshot);
  acknowledgeArchive(state,snapshot.state);
});
let visible=new Set(),target=null,look=null,inspection=null,tile=16;
let stopped=false,ready=false,quitting=false,polling=false,lastRejected=null,releaseTimer,heartbeatTimer;
let panelAction=null,unlockSession=null,choiceActions=[];

async function request(path,data) {
  const response=await fetch(`/api/${path}`,{
    method:data===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json','X-Aion-Client':'1',...(lease?{'X-Aion-Lease':lease}:{})},
    ...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(10_000),
  });
  const result=await response.json();
  if(!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}

function diagnostic(error) {
  console.error(error);
  request('client-error',{error:error.stack ?? String(error)}).catch(()=>{});
}

function save() {
  const snapshot={state:structuredClone(state),release,sequence:++sequence};
  return saveQueue.enqueue(snapshot).then(()=>{
    saveError=null;
  }).catch(error=>{saveError=error;console.error('Save failed',error);});
}

function openPanel(title,body,action=null,label='Return') {
  choiceActions=[];
  $('panel-title').textContent=title;$('panel-body').textContent=body;
  $('panel-close').textContent=label;panelAction=action;
  if(!$('panel').open) $('panel').showModal();
}
function closePanel() { $('panel').close();panelAction=null;choiceActions=[];canvas.focus(); }
$('panel-close').onclick=()=>{const action=panelAction;closePanel();action?.();};
$('panel').addEventListener('cancel',()=>{
  panelAction=null;choiceActions=[];
  if(state?.prompt) action({type:'cancel-prompt'});
});

function showChoices() {
  const prompt=state.prompt;
  if(!prompt) return;
  if(prompt.kind==='shrine' && prompt.input==='text') {
    const key=`${state.depth}:${prompt.x},${prompt.y}`;
    // An incoming release must not erase or steal focus from an unsent petition.
    if($('panel').open && $('petition-message')?.dataset.shrine===key) return;
    openPanel(prompt.title,prompt.text,()=>action({type:'cancel-prompt'}),'Leave it unsaid');
    const form=document.createElement('form');form.className='petition';
    const label=document.createElement('label');label.htmlFor='petition-message';label.textContent='Thy petition';
    const input=document.createElement('textarea');input.id='petition-message';
    input.dataset.shrine=key;input.rows=5;input.maxLength=2000;input.required=true;
    input.placeholder='Oracle, hear me…';
    const hint=document.createElement('small');hint.textContent='Enter speaks · Shift+Enter adds a line · Escape leaves it unsaid';
    const submit=document.createElement('button');submit.type='submit';submit.textContent='Speak';submit.disabled=true;
    input.addEventListener('input',()=>{submit.disabled=!input.value.trim();});
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const text=input.value.trim();if(!text) return;
      closePanel();action({type:'petition',text});
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();event.stopPropagation();form.requestSubmit();
      }
    });
    form.append(label,input,hint,submit);$('panel-body').append(form);input.focus();return;
  }
  openPanel(prompt.title,prompt.text,()=>action({type:'cancel-prompt'}),'Leave it unsaid');
  const list=document.createElement('div');list.className='choices';
  choiceActions=prompt.choices.map((choice,index)=>{
    const choose=()=>{closePanel();action({type:prompt.action ?? 'petition',id:choice.id});};
    const button=document.createElement('button');button.textContent=`${index+1}. ${choice.text}`;
    button.onclick=choose;list.append(button);return choose;
  });
  $('panel-body').append(list);
}

function help() {
  openPanel('The hand and the dark',
    'Arrows / WASD — move; walk into a creature to strike\nY U B N — diagonal movement\nSpace / period — wait\n'+
    Object.entries(mod?.bindings ?? {}).map(([key,action])=>`${key.toUpperCase()} — ${action.label}`).join('\n')+
    '\nX — examine nearby tiles (directions; Escape leaves)\nClick — examine a visible nearby tile\nM — sound on/off\nEnter — fullscreen\nQ — save and quit\n\nActions spend turns; examining and reading do not.\nAmber figures are preparing a blow at the outlined tile.');
}

function fov() {
  visible=new Set();
  new ROT.FOV.PreciseShadowcasting((x,y)=>!mod.opaque(state,x,y)).compute(state.player.x,state.player.y,mod.sight?.(state) ?? 8,(x,y)=>{
    if(x<0||y<0||x>=state.width||y>=state.height) return;
    const k=`${x},${y}`;visible.add(k);
    state.seen[k]=mod.appearance(state,x,y,{terrainOnly:true});
  });
}

function draw() {
  if(!state || !mod) return;
  const box=$('viewport').getBoundingClientRect();
  tile=Math.max(2,Math.floor(Math.min((box.width-2)/state.width,(box.height-2)/state.height)));
  const width=state.width*tile,height=state.height*tile,ratio=window.devicePixelRatio || 1;
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  ctx.scale(ratio,ratio);ctx.fillStyle='#0a0b0f';ctx.fillRect(0,0,width,height);
  for(let y=0;y<state.height;y++) for(let x=0;x<state.width;x++) {
    const k=`${x},${y}`,lit=visible.has(k),cell=lit?mod.appearance(state,x,y):state.seen[k];
    if(!cell) continue;
    ctx.globalAlpha=lit?1:.25;
    ctx.fillStyle=lit?'#18181f':'#121218';ctx.fillRect(x*tile,y*tile,tile,tile);
    const sprite=mod.sprites[cell.sprite];
    if(!sprite) continue;
    ctx.fillStyle=cell.color;
    const pixel=tile/sprite.length;
    sprite.forEach((row,sy)=>{for(let sx=0;sx<row.length;sx++) if(row[sx]!=='.' && row[sx]!==' ') {
      ctx.fillRect(x*tile+sx*pixel,y*tile+sy*pixel,Math.ceil(pixel),Math.ceil(pixel));
    }});
  }
  ctx.globalAlpha=1;
  for(const marker of mod.markers?.(state) ?? []) if(visible.has(`${marker.x},${marker.y}`)) {
    ctx.strokeStyle=marker.color;ctx.lineWidth=1;ctx.strokeRect(marker.x*tile+1.5,marker.y*tile+1.5,tile-3,tile-3);
  }
  if(look) {ctx.strokeStyle='#d8d3af';ctx.strokeRect(look.x*tile+.5,look.y*tile+.5,tile-1,tile-1);}
  const [status,...pack]=mod.status(state);$('status').textContent=status;$('pack').textContent=pack.join('\n');
  $('hint').textContent=stopped?'The Threshold is closed.':saveError?'Save interrupted — keep this tab open; Q retries saving.':
    target?'Choose a direction. Escape cancels.':look?'Examine nearby ground. Escape returns.':'Arrows / WASD move · X examine · ? controls';
  const messages=$('messages');
  const nearEnd=messages.scrollTop+messages.clientHeight>=messages.scrollHeight-25;
  messages.replaceChildren();
  for(const message of [...state.messages.slice(-40),...(inspection?[{text:inspection,kind:'inspection'}]:[])]) {
    const p=document.createElement('p');p.className=message.kind;
    p.textContent=message.kind==='oracle'?`Oracle: ${message.text}`:message.text;messages.append(p);
  }
  if(nearEnd || inspection) messages.scrollTop=messages.scrollHeight;
}

function examine(x,y) {
  if(!visible.has(`${x},${y}`) || Math.abs(x-state.player.x)+Math.abs(y-state.player.y)>2) return;
  look={x,y};inspection=mod.inspect(state,x,y);draw();
}

function action(a) {
  if(!ready || stopped || quitting || !state.player.hp) return;
  const previous=state,draft=structuredClone(state);
  try {
    mod.act(draft,a,{ROT,...api});validateState(draft);mod.validate(draft);
    state=draft;inspection=null;look=null;fov();draw();
  } catch(error) {
    state=previous;diagnostic(error);
    try {fov();draw();} catch { /* Keep the last canvas while the Oracle repairs the module. */ }
    return;
  }
  save();
  try {audio.play(mod.sounds[state.sound]);} catch(error) {diagnostic(error);}
  if(!state.player.hp) death();
  else if(state.prompt) showChoices();
}

function death() {
  openPanel('The witness is concluded.',
    `Depth ${state.depth}. ${state.player.kills} creatures granted silence.\n\nAnother witness may enter. The Oracle remembers this descent.`,async()=>{
      await save();
      if(saveError) {death();return;}
      const old=state;
      const next=mod.create({ROT,seed:crypto.getRandomValues(new Uint32Array(1))[0],...api});
      next.runId=crypto.randomUUID();
      next.history=[...(old.history ?? []),{depth:old.depth,turns:old.turn,kills:old.player.kills,silver:old.player.silver}].slice(-30);
      next.eventSequence=old.eventSequence;
      next.events=[];
      api.event(next,'new-witness',{previousDepth:old.depth});
      validateState(next);mod.validate(next);state=next;fov();draw();save();
    },'Another witness');
}

async function quit() {
  if(stopped || quitting) return;
  quitting=true;
  try {
    await save();
    if(saveError) throw saveError;
    await request('quit',{});
    stopped=true;clearInterval(releaseTimer);clearInterval(heartbeatTimer);unlockSession?.();draw();
    openPanel('The Threshold closes.','Thy place in the dark is kept. This window may be closed.');
  } catch(error) {
    console.error(error);
    openPanel('The descent is not yet saved.','Thy place could not be kept. Leave this window open, and press Q to try again.');
  } finally {quitting=false;}
}

function confirmQuit() {
  if(!ready || stopped) return;
  openPanel('Leave the Threshold?', 'The descent will be saved. The Oracle will fall silent.\nEscape returns to the dark.',quit,'Save and quit');
}

async function activate(manifest,initial=false) {
  const candidate=await import(manifest.url);
  validateModule(candidate);
  // Await ends before reading current state: actions during import are preserved.
  const next=state ? migrateWorld(candidate,state) : candidate.create({ROT,seed:crypto.getRandomValues(new Uint32Array(1))[0],...api});
  next.runId ??= crypto.randomUUID();
  validateState(next);candidate.validate(next);
  // Verify presentation before committing, not after corrupting the live registry.
  candidate.status(next);candidate.inspect(next,next.player.x,next.player.y);
  const cell=candidate.appearance(next,next.player.x,next.player.y);
  if(!candidate.sprites[cell.sprite]) throw new Error('Candidate player sprite missing');
  if(stopped || quitting) return;
  const previous=state,previousMod=mod,previousRelease=release,previousVisible=visible;
  try {
    state=next;mod=candidate;release=manifest.id;
    fov();draw();
  } catch(error) {
    state=previous;mod=previousMod;release=previousRelease;visible=previousVisible;
    if(mod && state) draw();
    throw error;
  }
  lastRejected=null;target=null;look=null;inspection=null;
  await save();
  await request('client-error',{error:null}).catch(error=>console.error(error));
  if(!state.prompt && $('petition-message') && $('panel').open) closePanel();
  if(state.prompt) showChoices();
  if(!initial && next.messages.length && JSON.stringify(next.messages)!==JSON.stringify(previous.messages) && next.messages.at(-1).kind==='oracle') audio.play(mod.sounds.oracle);
}

async function pollRelease() {
  if(!ready || polling || stopped || quitting) return;
  polling=true;
  try {
    const manifest=await request('release');
    if(manifest.id!==release && manifest.id!==lastRejected) {
      try {await activate(manifest);} catch(error) {lastRejected=manifest.id;diagnostic(error);}
    }
  } catch(error) {console.error('Release poll failed',error);}
  finally {polling=false;}
}

document.addEventListener('keydown',event=>{
  if($('history-panel').open) return;
  if(event.ctrlKey || event.metaKey || event.altKey) return;
  audio.unlock();
  const key=event.key.length===1?event.key.toLowerCase():event.key;
  if($('panel').open) {
    if(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
    if(event.target.closest?.('form')) return;
    if(choiceActions.length && /^[1-9]$/.test(key)) {
      event.preventDefault();choiceActions[Number(key)-1]?.();return;
    }
    if(key==='Enter') {event.preventDefault();$('panel-close').click();}
    return;
  }
  if(!ready || stopped) return;
  if(key==='q') {event.preventDefault();confirmQuit();return;}
  if(key==='?') {event.preventDefault();help();return;}
  if(key==='Escape') {target=null;look=null;inspection=null;draw();return;}
  if(key==='m') {toggleMute();return;}
  if(key==='Enter') {event.preventDefault();(document.fullscreenElement?document.exitFullscreen():$('game').requestFullscreen()).catch(()=>{});return;}
  const dir=directions[key];
  if(look) {
    if(dir) {event.preventDefault();examine(look.x+dir[0],look.y+dir[1]);}return;
  }
  if(target) {
    if(dir) {event.preventDefault();const type=target;target=null;action({type,dx:dir[0],dy:dir[1]});}return;
  }
  if(key==='x') {examine(state.player.x,state.player.y);return;}
  if(dir) {event.preventDefault();action({type:'move',dx:dir[0],dy:dir[1]});return;}
  if(key===' '||key==='.') {event.preventDefault();action({type:'wait'});return;}
  const binding=mod.bindings[key];
  if(binding) {event.preventDefault();if(binding.direction) {target=binding.type;draw();} else action({type:binding.type});}
});
canvas.addEventListener('click',event=>{
  audio.unlock();if(!ready||stopped) return;
  const box=canvas.getBoundingClientRect();examine(Math.floor((event.clientX-box.left)/tile),Math.floor((event.clientY-box.top)/tile));
});
function toggleMute() {audio.muted=!audio.muted;$('mute').textContent=audio.muted?'Muted':'Sound';}
$('help').onclick=help;$('quit').onclick=confirmQuit;$('mute').onclick=()=>{audio.unlock();toggleMute();};
setupHistory(request);
new ResizeObserver(()=>draw()).observe($('viewport'));

async function boot() {
  try {
    const clientId=sessionStorage.aionClient ??= crypto.randomUUID();
    const connection=await request('connect',{clientId});lease=connection.lease;
    if(connection.save) {state=connection.save.state;release=connection.save.release;}
    try {await activate(connection.release,true);}
    catch(error) {
      diagnostic(error);
      if(!connection.save || connection.save.release===connection.release.id) throw error;
      await activate({id:connection.save.release,url:`/releases/${connection.save.release}/index.js`},true);
      lastRejected=connection.release.id;
      diagnostic(error);
    }
    ready=true;canvas.focus();
    if(!state.player.hp) death();
    else if(state.prompt) showChoices();
    releaseTimer=setInterval(pollRelease,2500);
    heartbeatTimer=setInterval(()=>{
      if(!stopped && !quitting) request('heartbeat',{}).catch(error=>console.error('Heartbeat failed',error));
    },10_000);
  } catch(error) {
    console.error(error);openPanel('The Threshold is closed.','The way cannot open. Seek the keeper at the terminal.');unlockSession?.();
  }
}

// Browser-native lock stops duplicated tabs (which can share sessionStorage IDs)
// from both issuing turns. The server lease also rejects unrelated clients.
if(navigator.locks) {
  navigator.locks.request('aion-player',{ifAvailable:true},async lock=>{
    if(!lock) {openPanel('Another witness is present.','This descent is already open in another tab.');return;}
    const held=new Promise(resolve=>{unlockSession=resolve;});await boot();await held;
  });
} else boot();
