import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parentPort,workerData} from 'node:worker_threads';
import {initialState,playLegal,outcome,makeRecord,replay,sideToMove} from '../src/engine.mjs';
import {createSearchSession} from '../src/search.mjs';
function hash(body){return crypto.createHash('sha256').update(body).digest('hex');}
function entry(job,record,body){return {...job,file:`${job.id}.json`,sha256:hash(body),result:record.result,decisions:record.actions.length};}
function game(job,profile,output){
 const file=path.join(output,`${job.id}.json`);
 if(fs.existsSync(file)){
  const body=fs.readFileSync(file),record=JSON.parse(body);replay(record);
  if(record.turnLimit!==job.limit||record.compensation!==job.compensation||JSON.stringify(record.options)!==JSON.stringify(job.options)||JSON.stringify(record.agents)!==JSON.stringify({players:[String(job.budget),String(job.budget)],seed:String(job.seed),profile}))throw Error('Existing game identity mismatch');
  if(!record.result)throw Error('Nonterminal archive');return entry(job,record,body);
 }
 let state=initialState(job.limit,job.compensation,job.options),actions=[];
 const sessions=[createSearchSession(profile),createSearchSession(profile)];
 while(!outcome(state)){
  const decision=sessions[sideToMove(state)].search(state,job.budget,BigInt(job.seed)+BigInt(actions.length)*1000003n);
  state=playLegal(state,decision.action);actions.push(decision.action);
  for(const session of sessions)session.advance(decision.action);
  if(actions.length>5000)throw Error('Operational decision limit; no result assigned');
 }
 const record=makeRecord(job.limit,actions,{players:[String(job.budget),String(job.budget)],seed:String(job.seed),profile},job.compensation,job.options);
 const body=JSON.stringify(record)+'\n';const temporary=file+'.tmp';fs.writeFileSync(temporary,body);fs.renameSync(temporary,file);
 return entry(job,record,body);
}
parentPort.postMessage(game(workerData.job,workerData.profile,workerData.output));
