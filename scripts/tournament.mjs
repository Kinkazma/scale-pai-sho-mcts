import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {RULES,initialState,legalActions,playLegal,outcome,makeRecord,replay,analyze,sideToMove} from '../src/engine.mjs';
import {createSearchSession,profileForBudget} from '../src/search.mjs';
function runMatch(output,limit,players){
 const seed=20260906;
 let state=initialState(limit),actions=[],stats={simulations:0,searchMilliseconds:0,maxActive:0,maxFrozen:0,regionDecisions:0,movements:0,placements:0};
 const sessions=players.map(b=>createSearchSession(profileForBudget(b)));
 while(!outcome(state)){
  const result=sessions[sideToMove(state)].search(state,players[sideToMove(state)],BigInt(seed)+BigInt(actions.length)*1000003n);
  if(!result.action)throw Error('Missing action');
  stats.simulations+=result.simulations;stats.searchMilliseconds+=result.milliseconds;
  if(result.action[0]==='end-turn'){}else if(typeof result.action[0]==='string')stats.regionDecisions++;else if(result.action[0]<0)stats.placements++;else stats.movements++;
  state=playLegal(state,result.action);actions.push(result.action);
  for(const session of sessions)session.advance(result.action);
  const d=analyze(state);stats.maxActive=Math.max(stats.maxActive,d.regions.flat().filter(r=>r.status==='active').length);stats.maxFrozen=Math.max(stats.maxFrozen,d.frozen.size);
  if(actions.length>2400)throw Error('Resolution did not terminate');
 }
 const record=makeRecord(limit,actions,{players:players.map(String),seed:String(seed),profiles:players.map(profileForBudget),protocol:'fixed-catalog-mcts'});
 const verified=replay(record).at(-1);
 if(JSON.stringify(verified)!==JSON.stringify(state))throw Error('Replay mismatch');
 const id=`${limit}-${players[0]}-${players[1]}`,file=`${id}.json`,body=JSON.stringify({...record,statistics:stats},null,2)+'\n';
 fs.writeFileSync(path.join(output,file),body,{flag:'wx'});
 const [s0,s1]=record.result.scores;
 const entry={id,file,label:`${limit} tours · ${players[0]} / ${players[1]} · ${s0.total}–${s1.total}`,sha256:crypto.createHash('sha256').update(body).digest('hex'),players,turnLimit:limit,result:record.result,statistics:stats};
 return entry;
}
if(!isMainThread){parentPort.postMessage(runMatch(workerData.output,workerData.limit,workerData.players));}
else{
 const output=process.argv[2]||'public/examples',quick=process.argv.includes('--quick');
 fs.mkdirSync(output,{recursive:true});
 if(fs.existsSync(path.join(output,'index.json')))throw Error('Archive exists; choose a new directory.');
 const jobs=[];
 for(const limit of quick?[30]:[30,50,70])for(const pair of quick?[[8,32]]:[[8,32],[8,128],[32,128]])for(let swap=0;swap<(quick?1:2);swap++)jobs.push({limit,players:swap?[...pair].reverse():pair});
 const games=[];
 async function lane(){while(jobs.length){const job=jobs.shift();const entry=await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:{...job,output}});w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error(`Worker exit ${code}`));});});games.push(entry);console.log(JSON.stringify(entry));}}
 await Promise.all(Array.from({length:quick?1:Number(process.env.REGIONS_WORKERS??2)},lane));
 games.sort((a,b)=>a.turnLimit-b.turnLimit||a.players[0]-b.players[0]||a.players[1]-b.players[1]);
 fs.writeFileSync(path.join(output,'index.json'),JSON.stringify({rules:RULES,purpose:'Illustrative paired-seat matches, not a strength rating.',games},null,2)+'\n',{flag:'wx'});
}
