/** Finite, resumable evolutionary campaign; no live catalogue write. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {options,initialPlan,jobsFor} from './evolution-plan.mjs';
import {BASE_PROFILE,population,summary,confirmation} from './evolution-profiles.mjs';
import {acquireMeasurementLock} from './measurement-lock.mjs';

const [directory,configFile]=process.argv.slice(2);
if(!directory)throw Error('Usage: node scripts/evolve.mjs OUTPUT [CONFIG.json]');
const output=path.resolve(directory),config=options(configFile?JSON.parse(fs.readFileSync(configFile)):{});
fs.mkdirSync(output,{recursive:true});
const unlock=acquireMeasurementLock(path.join(output,'controller.lock'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const sources=['src/engine.mjs','src/region-resolution.mjs','src/search.mjs','src/search-memory.mjs','src/search-profile.json','src/mcts-catalog.json',
  'scripts/evolve.mjs','scripts/evolution-plan.mjs','scripts/evolution-profiles.mjs','scripts/evolution-game.mjs','scripts/evolution-worker.mjs','scripts/measurement-lock.mjs'];
const plan=initialPlan(config);plan.sources=Object.fromEntries(sources.map(f=>[f,digest(fs.readFileSync(new URL('../'+f,import.meta.url)))]));
const atomic=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
function pinned(file,value){
  if(fs.existsSync(file)){if(JSON.stringify(JSON.parse(fs.readFileSync(file)))!==JSON.stringify(value))throw Error('Plan/source changed; resume from frozen runtime with original config');}
  else atomic(file,value);
}
let pool=[];
try{
  pinned(path.join(output,'plan.json'),plan);pinned(path.join(output,'config.json'),config);
  for(const f of sources){
    const body=fs.readFileSync(new URL('../'+f,import.meta.url)),dest=path.join(output,'runtime',f);fs.mkdirSync(path.dirname(dest),{recursive:true});
    if(fs.existsSync(dest)){if(digest(fs.readFileSync(dest))!==plan.sources[f])throw Error('Frozen source mismatch');}
    else fs.writeFileSync(dest,body,{flag:'wx'});
  }
  const gamesDir=path.join(output,'games');fs.mkdirSync(gamesDir,{recursive:true});
  const started=performance.now(),deadline=started+config.maxActiveSeconds*1000;
  let stop=false;process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
  const stopped=()=>stop||performance.now()>=deadline||fs.existsSync(path.join(output,'STOP'));
  const status={protocol:plan.protocol,rules:plan.rules,complete:false,stage:'selection',generation:0,completedThisRun:0,generations:[],champion:config.initialProfile??BASE_PROFILE};
  const publish=()=>atomic(path.join(output,'status.json'),{...status,elapsedSeconds:(performance.now()-started)/1000});
  pool=Array.from({length:config.workers},()=>new Worker(path.join(output,'runtime/scripts/evolution-worker.mjs'),{workerData:{output:gamesDir}}));
  async function game(worker,job){
    return await new Promise((resolve,reject)=>{
      const clear=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);};
      const message=data=>{clear();data.error?reject(Error(data.error)):resolve(data.game);};
      const error=e=>{clear();reject(e);};const exit=c=>{clear();reject(Error(`Worker exited without result (${c})`));};
      worker.once('message',message);worker.once('error',error);worker.once('exit',exit);worker.postMessage(job);
    });
  }
  async function batch(jobs,name){
    pinned(path.join(output,`${name}-plan.json`),jobs);
    const pairs=[];for(let i=0;i<jobs.length;i+=2)pairs.push(jobs.slice(i,i+2));
    const results=[];
    await Promise.all(pool.map(async worker=>{
      while(pairs.length){
        if(stopped())break;
        const pair=pairs.shift();
        for(const job of pair){results.push(await game(worker,job));status.completedThisRun++;}
        publish();
        console.log(JSON.stringify({stage:name,completed:results.length,total:jobs.length,elapsedSeconds:(performance.now()-started)/1000}));
      }
    }));
    results.sort((a,b)=>a.id.localeCompare(b.id));
    const report={complete:results.length===jobs.length,games:results};atomic(path.join(output,`${name}-report.json`),report);
    return report;
  }
  let parent=config.initialProfile??BASE_PROFILE;const history=[...(config.initialHistory??[])];
  for(let generation=1;generation<=config.generations;generation++){
    status.generation=generation;publish();
    const candidates=population(parent,generation,config.offspring,config.seed),name=`selection-${generation}`;
    const report=await batch(jobsFor(plan,'selection',generation,candidates,history),name);
    if(!report.complete){status.stage='paused-selection';publish();break;}
    const ranked=candidates.map((profile,index)=>({profile,index,...summary(report.games.filter(g=>g.candidateId===profile.id))}))
      .sort((a,b)=>b.scoreRate-a.scoreRate||a.index-b.index);
    history.push(parent);parent=ranked[0].profile;status.champion=parent;
    status.generations.push({generation,ranked});atomic(path.join(output,`${name}-ranking.json`),ranked);publish();
  }
  if(status.generations.length===config.generations&&!stopped()){
    status.stage='confirmation';publish();
    const report=await batch(jobsFor(plan,'confirmation',0,[parent]),'confirmation');
    // Partial evidence stays descriptive: no repeated statistical acceptance.
    if(report.complete){
      const assessment=confirmation(report.games,config.budgets),candidate={rules:plan.rules,protocol:plan.protocol,profile:parent,complete:true,assessment,planSha256:digest(fs.readFileSync(path.join(output,'plan.json')))};
      atomic(path.join(output,'candidate.json'),candidate);status.assessment=assessment;status.complete=true;status.stage='complete';
    }else status.stage='paused-confirmation';
    publish();
  }else if(!status.stage.startsWith('paused')){status.stage='paused-before-confirmation';publish();}
  console.log(JSON.stringify({stage:status.stage,complete:status.complete,champion:parent.id,resume:`node "${path.join(output,'runtime/scripts/evolve.mjs')}" "${output}" "${path.join(output,'config.json')}"`}));
}finally{await Promise.all(pool.map(w=>w.terminate()));unlock();}
