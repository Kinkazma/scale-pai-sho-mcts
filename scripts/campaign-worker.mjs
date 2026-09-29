import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parentPort,workerData} from 'node:worker_threads';
import {RULES,initialState,playLegal,sideToMove,outcome,makeRecord,replay} from '../src/engine.mjs';
import {createSearchSession} from '../src/search.mjs';

function run(job){
  const profiles=job.profiles??[job.profile,job.profile];
  const players=job.players??[job.budget,job.budget];
  const agents={players:players.map(String),profiles,seed:String(job.seed)};
  const file=path.join(workerData.output,job.id+'.json');let record,body;
  if(fs.existsSync(file)){
    body=fs.readFileSync(file);record=JSON.parse(body);replay(record);
    if(record.rules!==RULES||record.turnLimit!==job.limit||record.compensation!==job.compensation||JSON.stringify(record.options)!==JSON.stringify(job.options)||JSON.stringify(record.agents)!==JSON.stringify(agents)||!record.result)throw Error('Archived game identity mismatch');
  }else{
    const started=performance.now();let state=initialState(job.limit,job.compensation,job.options),actions=[];
    const sessions=profiles.map(createSearchSession);
    const statistics={simulations:0,evaluations:0,seconds:0};
    while(!outcome(state)){
      const side=sideToMove(state),decision=sessions[side].search(state,players[side],BigInt(job.seed)+BigInt(actions.length)*1000003n);
      if(!decision.action)throw Error('Missing nonterminal action');
      statistics.simulations+=decision.simulations;statistics.evaluations+=decision.evaluations;
      state=playLegal(state,decision.action);actions.push(decision.action);
      for(const session of sessions)session.advance(decision.action);
      if(actions.length>5000)throw Error('Operational guard reached; no result assigned');
    }
    statistics.seconds=(performance.now()-started)/1000;
    record={...makeRecord(job.limit,actions,agents,job.compensation,job.options),statistics};
    if(JSON.stringify(replay(record).at(-1))!==JSON.stringify(state))throw Error('Replay mismatch');
    body=JSON.stringify(record)+'\n';fs.writeFileSync(file+'.tmp',body);fs.renameSync(file+'.tmp',file);
  }
  return {...job,file:job.id+'.json',sha256:crypto.createHash('sha256').update(body).digest('hex'),result:record.result,statistics:record.statistics,decisions:record.actions.length};
}
parentPort.on('message',job=>{
  try{parentPort.postMessage({game:run(job)});}catch(error){parentPort.postMessage({error:error.stack});}
});
