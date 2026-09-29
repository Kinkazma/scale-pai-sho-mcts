import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parentPort,workerData} from 'node:worker_threads';
import {RULES,replay} from '../src/engine.mjs';
import {playMatch} from './evolution-game.mjs';
parentPort.on('message',job=>{
  try{
    const file=path.join(workerData.output,job.id+'.json');let body,record;
    if(fs.existsSync(file)){
      body=fs.readFileSync(file);record=JSON.parse(body);replay(record);
      const expected={players:[String(job.budget),String(job.budget)],profiles:job.profiles,seed:String(job.seed)};
      if(record.rules!==RULES||record.turnLimit!==job.limit||record.compensation!==0||JSON.stringify(record.options)!==JSON.stringify(job.options)||JSON.stringify(record.agents)!==JSON.stringify(expected)||!record.result)throw Error('Archived game identity mismatch');
    }else{
      record=playMatch(job);body=JSON.stringify(record)+'\n';fs.writeFileSync(file+'.tmp',body);fs.renameSync(file+'.tmp',file);
    }
    parentPort.postMessage({game:{...job,file:job.id+'.json',sha256:crypto.createHash('sha256').update(body).digest('hex'),result:record.result,statistics:record.statistics,decisions:record.actions.length}});
  }catch(error){parentPort.postMessage({error:error.stack});}
});
