import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {initialState,playLegal,outcome,makeRecord,replay} from '../src/engine.mjs';
import {search} from '../src/search.mjs';
import {summarize} from './calibration-stats.mjs';
import {studyPlan} from './study-plan.mjs';
function hash(body){return crypto.createHash('sha256').update(body).digest('hex');}
{
 const output=process.argv[2];if(!output)throw Error('Output directory required');fs.mkdirSync(output,{recursive:true});
 const proposed=studyPlan(),planFile=path.join(output,'plan.json');
 // Frozen executable sources protect resumability from changed engine/search code.
 const sourceFiles=['src/engine.mjs','src/region-resolution.mjs','src/search.mjs','src/search-memory.mjs','src/search-profile.json','src/mcts-catalog.json','scripts/calibrate.mjs','scripts/study-plan.mjs','scripts/calibration-stats.mjs','scripts/study-worker.mjs'];
 proposed.sources=Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(new URL('../'+file,import.meta.url)))]));
 if(fs.existsSync(planFile)){if(JSON.stringify(JSON.parse(fs.readFileSync(planFile)))!==JSON.stringify(proposed))throw Error('Study plan/source changed; use a new archive');}
 else fs.writeFileSync(planFile,JSON.stringify(proposed,null,2)+'\n',{flag:'wx'});
 const runtime=path.join(output,'runtime');
 for(const file of sourceFiles){const destination=path.join(runtime,file),body=fs.readFileSync(new URL('../'+file,import.meta.url));fs.mkdirSync(path.dirname(destination),{recursive:true});if(fs.existsSync(destination)){if(hash(fs.readFileSync(destination))!==proposed.sources[file])throw Error('Archived runtime changed');}else fs.writeFileSync(destination,body,{flag:'wx'});}
 const plan=proposed,results=[];
 const maxArgument=process.argv.indexOf('--max-new-games'),maximum=maxArgument<0?Infinity:Number(process.argv[maxArgument+1]);
 if(!(maximum>0))throw Error('Positive max-new-games required');
 let scheduledNew=0;
 const jobs=plan.jobs.filter(job=>fs.existsSync(path.join(output,`${job.id}.json`))||scheduledNew++<maximum);
 const atomic=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
 const report=()=>({plan,complete:results.length===plan.games,completed:results.length,summary:summarize(results),byBudget:plan.budgets.map(b=>({budget:b,...summarize(results.filter(g=>g.budget===b))})),cells:plan.budgets.flatMap(b=>plan.limits.flatMap(l=>[false,true].map(h=>({budget:b,limit:l,hemispheres:h,...summarize(results.filter(g=>g.budget===b&&g.limit===l&&g.options.hemispheres===h))})))),games:[...results].sort((a,b)=>a.id.localeCompare(b.id))});
 async function lane(){while(jobs.length){const job=jobs.shift();const result=await new Promise((resolve,reject)=>{const w=new Worker(path.resolve(runtime,'scripts/study-worker.mjs'),{workerData:{job,profile:job.profile,output}});w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error(`Worker exit ${code}`));});});results.push(result);atomic(path.join(output,'report.json'),report());if(results.length%10===0)console.log(JSON.stringify({completed:results.length,total:plan.games,budget:job.budget}));}}
 atomic(path.join(output,'report.json'),report());await Promise.all(Array.from({length:Number(process.env.REGIONS_WORKERS??2)},lane));
 console.log(JSON.stringify({completed:results.length,summary:summarize(results)}));
}
