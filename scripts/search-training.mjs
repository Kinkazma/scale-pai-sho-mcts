import fs from 'node:fs';
import path from 'node:path';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {initialState,sideToMove,playLegal,outcome,makeRecord,RULES} from '../src/engine.mjs';
import {search,SEARCH_PROFILES} from '../src/search.mjs';
function match(job){
 const profiles=job.swap?[job.profile,SEARCH_PROFILES.baseline]:[SEARCH_PROFILES.baseline,job.profile];
 let state=initialState(job.limit,0,job.options),actions=[];
 while(!outcome(state)){
  const decision=search(state,job.budget,BigInt(job.seed)+BigInt(actions.length)*1000003n,profiles[sideToMove(state)]);
  state=playLegal(state,decision.action);actions.push(decision.action);
  if(actions.length>5000)throw Error('Decision guard; no outcome assigned.');
 }
 const record=makeRecord(job.limit,actions,{players:[String(job.budget),String(job.budget)],seed:String(job.seed),profiles},0,job.options);
 fs.writeFileSync(path.join(job.output,job.id+'.json'),JSON.stringify(record)+'\n',{flag:'wx'});
 return {...job,result:record.result,candidateScore:record.result.winner===null?.5:record.result.winner===(job.swap?0:1)?1:0};
}
if(!isMainThread)parentPort.postMessage(match(workerData));
else{
 const output=process.argv[2];fs.mkdirSync(output,{recursive:true});
 const phase=process.argv.includes('--holdout')?'holdout':'selection';
 const jobs=[];
 for(const key of ['guided4','guided8'])for(const limit of [15,30])for(const budget of [8,32])for(const mode of [false,true])for(const swap of [false,true]){
  const id=`${phase}-${key}-${limit}-${budget}-${mode}-${swap}`;
  jobs.push({id,output,profile:SEARCH_PROFILES[key],limit,budget,options:{hemispheres:mode,jadeHemisphere:'north'},swap,seed:(phase==='holdout'?92000000:91000000)+limit*100+budget});
 }
 fs.writeFileSync(path.join(output,'plan.json'),JSON.stringify({rules:RULES,phase,jobs},null,2),{flag:'wx'});
 const results=[];async function lane(){while(jobs.length){const job=jobs.shift();const r=await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:job});w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error(`Exit ${code}`));});});results.push(r);console.log(JSON.stringify({done:results.length,total:32,id:r.id,score:r.candidateScore}));}}
 await Promise.all(Array.from({length:4},lane));
 const profiles=['guided4','guided8'].map(key=>{const rs=results.filter(r=>r.profile.id===SEARCH_PROFILES[key].id);return {profile:SEARCH_PROFILES[key],games:rs.length,scoreRate:rs.reduce((s,r)=>s+r.candidateScore,0)/rs.length};});
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({rules:RULES,phase,profiles,games:results},null,2),{flag:'wx'});console.log(JSON.stringify(profiles));
}
