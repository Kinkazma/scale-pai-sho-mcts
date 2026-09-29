import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {replay,outcome} from '../src/engine.mjs';

test('campaign journal resumes exactly and rejects a different agent identity',async()=>{
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'regions campaign '));
  const worker=new Worker(new URL('../scripts/campaign-worker.mjs',import.meta.url),{workerData:{output}});
  const run=job=>new Promise((resolve,reject)=>{
    const cleanup=()=>{worker.off('message',message);worker.off('error',error);};
    const message=data=>{cleanup();data.error?reject(Error(data.error)):resolve(data.game);};
    const error=e=>{cleanup();reject(e);};
    worker.once('message',message);worker.once('error',error);worker.postMessage(job);
  });
  try{
    const profile={id:'archive-test',candidates:8,rolloutDepth:0};
    const job={id:'one-game',budget:8,profile,limit:15,seed:942713,compensation:0,options:{hemispheres:false,jadeHemisphere:'north',compensationSide:0}};
    const first=await run(job),body=await fs.readFile(path.join(output,first.file),'utf8');
    const record=JSON.parse(body);
    assert.deepEqual(outcome(replay(record).at(-1)),first.result);
    assert.deepEqual(await run(job),first);
    assert.equal(await fs.readFile(path.join(output,first.file),'utf8'),body);
    await assert.rejects(run({...job,profile:{...profile,id:'other-agent'}}),/identity mismatch/);
  }finally{
    await worker.terminate();await fs.rm(output,{recursive:true,force:true});
  }
});
