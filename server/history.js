import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';

const exec=promisify(execFile);
export async function run(command,args,cwd) {
  const result=await exec(command,args,{cwd,timeout:15_000,maxBuffer:512*1024,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  return result.stdout.trim();
}

export async function initGame(root) {
  const cwd=join(root,'game');
  try {await stat(join(cwd,'.git'));return {created:false};}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  await run('git',['init','-b','main'],cwd);
  await run('git',['add','--','*.js','README.md','LICENSE'],cwd);
  // Explicit fallback author for a fresh install; never alter user Git settings.
  let identity=[];
  try {await run('git',['var','GIT_AUTHOR_IDENT'],cwd);}
  catch {identity=['-c','user.name=Aion Oracle','-c','user.email=oracle@aion.local'];}
  await run('git',[...identity,'commit','-m','Seed the dungeon'],cwd);
  await run('git',['tag','aion-seed'],cwd);
  return {created:true};
}

export function createHistory(root) {
  const cwd=join(root,'game');
  const git=args=>run('git',args,cwd);
  async function history(offset=0) {
    if(!Number.isInteger(offset)||offset<0||offset>1_000_000) throw Error('Invalid history offset');
    // Never accidentally show the host's parent repository when game/.git is absent.
    try {await stat(join(cwd,'.git'));} catch {throw Error('Game history is unavailable. Run npm run game:init in the terminal.');}
    const text=await git(['log',`--skip=${offset}`,'-31','--format=%H%x09%aI%x09%s']);
    const all=text?text.split('\n').map(line=>{
      const [hash,date,...subject]=line.split('\t');return {hash,date,subject:subject.join('\t')};
    }):[];
    return {commits:all.slice(0,30),next:all.length>30?offset+30:null,
      dirty:!!(await git(['status','--porcelain']))};
  }
  return {history};
}
