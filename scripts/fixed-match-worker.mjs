import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parentPort,workerData} from 'node:worker_threads';
import {RULES,initialState,playLegal,sideToMove,outcome,makeRecord,replay} from '../src/engine.mjs';
import {createSearchSession} from '../src/search.mjs';
const {job,output}=workerData,profiles=job.swap?[job.profile,job.reference]:[job.reference,job.profile];
const agents={players:[String(job.budget),String(job.budget)],profiles,seed:String(job.seed)};
const file=path.join(output,job.id+'.json');let record,body;
if(fs.existsSync(file)){
 body=fs.readFileSync(file);record=JSON.parse(body);replay(record);
 if(record.rules!==RULES||record.turnLimit!==job.limit||record.compensation!==0||JSON.stringify(record.options)!==JSON.stringify(job.options)||JSON.stringify(record.agents)!==JSON.stringify(agents)||!record.result)throw Error('Archived game identity mismatch');
}else{
 const started=performance.now();let state=initialState(job.limit,0,job.options),actions=[];
 const sessions=profiles.map(createSearchSession);
 const statistics={simulations:0,evaluations:0,seconds:0,maxDepth:0};
 while(!outcome(state)){
  const decision=sessions[sideToMove(state)].search(state,job.budget,BigInt(job.seed)+BigInt(actions.length)*1000003n);
  statistics.simulations+=decision.simulations;statistics.evaluations+=decision.evaluations;statistics.maxDepth=Math.max(statistics.maxDepth,decision.maxDepth);
  state=playLegal(state,decision.action);actions.push(decision.action);
  for(const session of sessions)session.advance(decision.action);
  if(actions.length>5000)throw Error('Operational decision guard; no result assigned');
 }
 statistics.seconds=(performance.now()-started)/1000;
 record={...makeRecord(job.limit,actions,agents,0,job.options),statistics};body=JSON.stringify(record)+'\n';fs.writeFileSync(file+'.tmp',body);fs.renameSync(file+'.tmp',file);
}
parentPort.postMessage({...job,file:job.id+'.json',sha256:crypto.createHash('sha256').update(body).digest('hex'),result:record.result,statistics:record.statistics,candidateScore:record.result.winner===null?.5:record.result.winner===(job.swap?0:1)?1:0});
