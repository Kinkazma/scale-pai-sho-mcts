import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {leaguePlan,verificationPlan} from './campaign-plan.mjs';
import {studyPlan} from './study-plan.mjs';
import {summarize} from './calibration-stats.mjs';

const [mode,outputArgument,selectionFile]=process.argv.slice(2);
if(!['verification','league','equilibrium'].includes(mode)||!outputArgument)throw Error('Expected verification|league|equilibrium OUTPUT [SELECTION_REPORT]');
const output=path.resolve(outputArgument),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceFiles=['src/engine.mjs','src/region-resolution.mjs','src/search.mjs','src/search-memory.mjs','src/search-profile.json','src/mcts-catalog.json','scripts/campaign.mjs','scripts/campaign-plan.mjs','scripts/campaign-worker.mjs','scripts/study-plan.mjs','scripts/calibration-stats.mjs'];
const plan=mode==='league'?leaguePlan():mode==='equilibrium'?studyPlan():verificationPlan(JSON.parse(fs.readFileSync(selectionFile)));
if(selectionFile)plan.selectionSha256=hash(fs.readFileSync(selectionFile));
plan.sources=Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(new URL('../'+file,import.meta.url)))]));
fs.mkdirSync(output,{recursive:true});
const planFile=path.join(output,'plan.json');
if(fs.existsSync(planFile)){if(JSON.stringify(JSON.parse(fs.readFileSync(planFile)))!==JSON.stringify(plan))throw Error('Plan or source changed; use a new archive or the original frozen runtime');}
else fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
for(const file of sourceFiles){
  const target=path.join(output,'runtime',file),body=fs.readFileSync(new URL('../'+file,import.meta.url));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if(fs.existsSync(target)){if(hash(fs.readFileSync(target))!==plan.sources[file])throw Error('Archived source changed');}
  else fs.writeFileSync(target,body,{flag:'wx'});
}
const results=[],jobs=[...plan.jobs],workers=Number(process.env.REGIONS_WORKERS??2);
if(!Number.isInteger(workers)||workers<1||workers>8)throw Error('REGIONS_WORKERS must be 1..8');
function publish(){
  const games=[...results].sort((a,b)=>a.id.localeCompare(b.id));
  const report={plan,complete:games.length===plan.games,completed:games.length,summary:summarize(games),games};
  if(mode==='equilibrium'){
    report.byBudget=plan.budgets.map(b=>({budget:b,...summarize(games.filter(g=>g.budget===b))}));
    report.cells=plan.budgets.flatMap(b=>plan.limits.flatMap(l=>[false,true].map(h=>({budget:b,limit:l,hemispheres:h,...summarize(games.filter(g=>g.budget===b&&g.limit===l&&g.options.hemispheres===h))}))));
  }
  const file=path.join(output,'report.json');fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(file+'.tmp',file);
}
publish();
async function lane(){
  const worker=new Worker(path.join(output,'runtime/scripts/campaign-worker.mjs'),{workerData:{output}});
  try{while(jobs.length){
    const job=jobs.shift();
    const result=await new Promise((resolve,reject)=>{
      const clear=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);};
      const message=data=>{clear();data.error?reject(Error(data.error)):resolve(data.game);};
      const error=e=>{clear();reject(e);};const exit=code=>{clear();reject(Error(`Worker exited without result (${code})`));};
      worker.once('message',message);worker.once('error',error);worker.once('exit',exit);worker.postMessage(job);
    });
    results.push(result);publish();console.log(JSON.stringify({mode,completed:results.length,total:plan.games,id:job.id,seconds:result.statistics?.seconds}));
  }}finally{await worker.terminate();}
}
await Promise.all(Array.from({length:Math.min(workers,jobs.length)},lane));
if(mode==='league'){
  const lines=plan.jobs.map((job,i)=>{
    const game=results.find(g=>g.id===job.id),ids=job.players.map((b,s)=>`regions-${b}-${job.profiles[s].id}`);
    return [i,job.pair,...ids,game.result.winner===null?.5:game.result.winner===0?1:0].join('\t');
  });
  fs.writeFileSync(path.join(output,'elo-input.tsv'),lines.join('\n')+'\n');
}
