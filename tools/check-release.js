import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import ROT from 'rot-js';
import { api, validateModule, validateState, migrateWorld } from '../shared/runtime.js';

const dir=resolve(process.argv[2] ?? 'game');
const mod=await import(pathToFileURL(resolve(dir,'index.js')));
validateModule(mod);
function check(state) {
  validateState(state);mod.validate(state);
  for(const row of mod.status(state)) if(typeof row!=='string') throw new Error('Invalid HUD');
  for(const row of state.map) for(const tile of row) if(typeof tile!=='string') throw new Error('Invalid tile');
  const {x,y}=state.player;
  const cell=mod.appearance(state,x,y);
  if(!mod.sprites[cell.sprite]) throw new Error('Missing player sprite');
  mod.inspect(state,x,y);mod.opaque(state,x,y);
}
const saveArg=process.argv.indexOf('--save');
if(saveArg!==-1) {
  const saved=JSON.parse(await readFile(process.argv[saveArg+1],'utf8'));
  const state=migrateWorld(mod,saved.state);check(state);
  if(JSON.stringify(state)!==JSON.stringify(migrateWorld(mod,state))) throw new Error('Current-save migration is not idempotent');
} else check(mod.create({ROT,seed:19,...api}));
console.log('Module loaded; state and migration compatible.');
