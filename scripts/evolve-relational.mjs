/** Finite, resumable evolutionary campaign; no live catalogue write. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runSequential} from './sequential-validation.mjs';
import {Worker} from 'node:worker_threads';
import {options,initialPlan,initialParents,jobsFor,population,selectElites,assess} from './evolution-relational-plan.mjs';
import {SOURCES} from './relational-sources.mjs';
import {registerFamily} from './evolution-family.mjs';
import {fileURLToPath} from 'node:url';
import {acquireMeasurementLock} from './measurement-lock.mjs';

const [directory,configFile]=process.argv.slice(2);
if(!directory)throw Error('Usage: node scripts/evolve-relational.mjs OUTPUT [CONFIG.json]');
const output=path.resolve(directory),input=configFile?JSON.parse(fs.readFileSync(configFile)):{};
const ledger=input.familyRegistry??fileURLToPath(new URL('../reports/relational-family-registry.json',import.meta.url));
const config=options({...input,familyRegistry:ledger,familyIndex:input.sequentialValidation?1:registerFamily(ledger,output,input.familyIndex??null)});
fs.mkdirSync(output,{recursive:true});
const unlock=acquireMeasurementLock(path.join(output,'controller.lock'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const sources=SOURCES;
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
  const stopped=()=>stop||performance.now()>=deadline||Date.now()/1000>=(config.absoluteDeadline??Infinity)||fs.existsSync(path.join(output,'STOP'));
  const status={protocol:plan.protocol,rules:plan.rules,complete:false,stage:'selection',generation:0,completedThisRun:0,generations:[],champions:{},elites:initialParents(plan),
    history:Object.fromEntries(config.budgets.map(b=>[b,[...(config.initialHistoryByBudget?.[b]??[])]]))};
  const publish=()=>atomic(path.join(output,'status.json'),{...status,elapsedSeconds:(performance.now()-started)/1000});
  pool=Array.from({length:config.workers},()=>new Worker(path.join(output,'runtime/scripts/evolution-relational-worker.mjs'),{workerData:{output:gamesDir}}));
  async function game(worker,job){
    return await new Promise((resolve,reject)=>{
      const clear=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);};
      const message=data=>{clear();data.error?reject(Error(data.error)):resolve(data.game);};
      const error=e=>{clear();reject(e);};const exit=c=>{clear();reject(Error(`Worker exited without result (${c})`));};
      worker.once('message',message);worker.once('error',error);worker.once('exit',exit);worker.postMessage(job);
    });
  }
  async function batch(jobs,name,{costCredit=Infinity}={}){
    pinned(path.join(output,`${name}-plan.json`),jobs);
    const pairs=[];for(let i=0;i<jobs.length;i+=2)pairs.push(jobs.slice(i,i+2));
    const results=[];let spent=0;
    await Promise.all(pool.map(async worker=>{
      while(pairs.length){
        if(stopped()||spent>=costCredit)break;
        const pair=pairs.shift();
        for(const job of pair){const result=await game(worker,job);results.push(result);spent+=result.statistics.searchSeconds.reduce((a,b)=>a+b,0);status.completedThisRun++;}
        publish();
        console.log(JSON.stringify({stage:name,completed:results.length,total:jobs.length,elapsedSeconds:(performance.now()-started)/1000}));
      }
    }));
    results.sort((a,b)=>a.id.localeCompare(b.id));
    const report={complete:results.length===jobs.length,games:results};atomic(path.join(output,`${name}-report.json`),report);
    return report;
  }
  let parents=initialParents(plan);const history=status.history,selectionGames=[];
  for(let generation=1;generation<=config.generations;generation++){
    status.generation=generation;publish();
    const candidates=Object.fromEntries(config.budgets.map(b=>[b,population(parents[b],generation,b,config.offspring,config.seed)]));
    const report=await batch(jobsFor(plan,'selection',generation,candidates,history),`selection-${generation}`);
    if(!report.complete){status.stage='paused-selection';publish();break;}
    selectionGames.push(...report.games);
    const ranked={};
    for(const b of config.budgets){
      ranked[b]=selectElites(candidates[b],report.games.filter(g=>g.budget===b),config.elites);
      history[b].push(...parents[b]);history[b]=history[b].slice(-16);
      parents[b]=ranked[b].map(x=>x.profile);status.champions[b]=parents[b][0];
    }
    status.elites=parents;status.generations.push({generation,ranked});
    atomic(path.join(output,`selection-${generation}-ranking.json`),ranked);publish();
  }
  if(status.generations.length===config.generations&&!stopped()){
    status.stage='confirmation';publish();
    if(config.sequentialValidation){
      if(config.budgets.length!==1)throw Error('Sequential validation requires independent budget lanes');
      const result=await runSequential({plan,output,profile:parents[config.budgets[0]][0],selection:selectionGames,batch,stopped});
      status.assessment=[result.assessment];status.validationCost=result.cost;status.acceptedProfiles=result.acceptedProfile?{[config.budgets[0]]:result.acceptedProfile}:{};
      status.complete=result.finished;status.stage=result.finished?'complete':'paused-confirmation';
      if(result.finished)atomic(path.join(output,'candidate.json'),{rules:plan.rules,protocol:plan.protocol,profiles:status.acceptedProfiles,complete:true,assessment:status.assessment,planSha256:digest(fs.readFileSync(path.join(output,'plan.json')))});
    }else{
    const report=await batch(jobsFor(plan,'confirmation',0,Object.fromEntries(config.budgets.map(b=>[b,[parents[b][0]]]))),'confirmation');
    // Partial evidence stays descriptive: no repeated statistical acceptance.
    if(report.complete){
      const assessment=assess(plan,report.games),candidate={rules:plan.rules,protocol:plan.protocol,profiles:status.champions,complete:true,assessment,planSha256:digest(fs.readFileSync(path.join(output,'plan.json')))};
      atomic(path.join(output,'candidate.json'),candidate);status.assessment=assessment;status.complete=true;status.stage='complete';
    }else status.stage='paused-confirmation';
    }
    publish();
  }else if(!status.stage.startsWith('paused')){status.stage='paused-before-confirmation';publish();}
  console.log(JSON.stringify({stage:status.stage,complete:status.complete,champions:status.champions,resume:`node "${path.join(output,'runtime/scripts/evolve-relational.mjs')}" "${output}" "${path.join(output,'config.json')}"`}));
}finally{await Promise.all(pool.map(w=>w.terminate()));unlock();}
