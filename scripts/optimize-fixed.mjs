import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {RULES} from '../src/engine.mjs';
const output=process.argv[2];if(!output)throw Error('Output required');
const phase=process.argv.includes('--verification')?'verification':'selection';
const reference={id:'guided8-v1',candidates:8},challengers=[{id:'guided8-wide-v2',candidates:8,widening:3},{id:'guided8-static-v10',candidates:8,rolloutDepth:0}];
const budgets=[8,16,32,64,128,256,512,1024],jobs=[];
for(const profile of challengers)for(const budget of budgets)for(const hemispheres of [false,true])for(const swap of [false,true]){
 const options={hemispheres,jadeHemisphere:phase==='verification'?'south':'north',compensationSide:0};
 const seed=(phase==='verification'?94000000:93000000)+budget*101;
 jobs.push({id:`${profile.id}-${budget}-${hemispheres}-${swap}`,profile,reference,budget,limit:phase==='verification'?30:15,options,swap,seed});
}
const sourceFiles=['src/engine.mjs','src/region-resolution.mjs','src/search.mjs','src/search-memory.mjs','src/search-profile.json','src/mcts-catalog.json','scripts/fixed-match-worker.mjs','scripts/optimize-fixed.mjs'];
const hash=body=>crypto.createHash('sha256').update(body).digest('hex');
const sources=Object.fromEntries(sourceFiles.map(f=>[f,hash(fs.readFileSync(new URL('../'+f,import.meta.url)))]));
const plan={protocol:'fixed-mcts-parameter-comparison-v1',rules:RULES,phase,reference,challengers,budgets,games:jobs.length,jobs,sources};
fs.mkdirSync(output,{recursive:true});
const planFile=path.join(output,'plan.json');
if(fs.existsSync(planFile)){if(JSON.stringify(JSON.parse(fs.readFileSync(planFile)))!==JSON.stringify(plan))throw Error('Existing plan/source mismatch');}
else fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
const runtime=path.join(output,'runtime');
for(const f of sourceFiles){const target=path.join(runtime,f);fs.mkdirSync(path.dirname(target),{recursive:true});const body=fs.readFileSync(new URL('../'+f,import.meta.url));if(fs.existsSync(target)){if(hash(fs.readFileSync(target))!==sources[f])throw Error('Runtime changed');}else fs.writeFileSync(target,body,{flag:'wx'});}
const results=[],pending=[...jobs];
function summary(games){return {games:games.length,wins:games.filter(g=>g.candidateScore===1).length,draws:games.filter(g=>g.candidateScore===.5).length,losses:games.filter(g=>g.candidateScore===0).length,scoreRate:games.length?games.reduce((s,g)=>s+g.candidateScore,0)/games.length:null};}
function publish(){const report={plan,complete:results.length===jobs.length,completed:results.length,profiles:challengers.map(p=>({profile:p,...summary(results.filter(g=>g.profile.id===p.id)),byBudget:budgets.map(b=>({budget:b,...summary(results.filter(g=>g.profile.id===p.id&&g.budget===b))}))})),games:[...results].sort((a,b)=>a.id.localeCompare(b.id))};const file=path.join(output,'report.json');fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(file+'.tmp',file);}
publish();
async function lane(){while(pending.length){const job=pending.shift();const result=await new Promise((resolve,reject)=>{const w=new Worker(path.resolve(runtime,'scripts/fixed-match-worker.mjs'),{workerData:{job,output}});w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error(`Worker exit ${code}`));});});results.push(result);publish();console.log(JSON.stringify({completed:results.length,total:jobs.length,id:job.id,candidateScore:result.candidateScore,seconds:result.statistics.seconds}));}}
await Promise.all(Array.from({length:Number(process.env.REGIONS_WORKERS??2)},lane));
