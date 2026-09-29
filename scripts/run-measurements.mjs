// Sequential, resumable local MCTS measurements. No controller or neural APIs.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {acquireMeasurementLock} from './measurement-lock.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const [prefix,date,waitPidArgument]=process.argv.slice(2);
if(!prefix||!/^[-a-zA-Z0-9]+$/.test(prefix)||!/^\d{8}$/.test(date??''))throw Error('Expected archive prefix YYYYMMDD [existing verification PID]');
const runName=`${prefix}-${date}`;
const names=Object.fromEntries(['selection','verification','league','equilibrium'].map(stage=>[stage,`${prefix}-${stage}-${date}`]));
const directories=Object.fromEntries(Object.entries(names).map(([key,name])=>[key,path.join(root,'artifacts',name)]));
const stateFile=path.join(root,'artifacts',`${runName}-measurements.json`);
const lockFile=stateFile+'.lock';
fs.mkdirSync(path.dirname(stateFile),{recursive:true});
const releaseLock=acquireMeasurementLock(lockFile);
let stage='starting';
function status(state,error){
  const body={state,stage,pid:process.pid,workers:Number(process.env.REGIONS_WORKERS??2),archives:directories,error,updatedAt:new Date().toISOString()};
  fs.writeFileSync(stateFile+'.tmp',JSON.stringify(body,null,2)+'\n');fs.renameSync(stateFile+'.tmp',stateFile);
}
async function command(script,args){
  const log=fs.openSync(path.join(root,'artifacts',`${runName}-${stage}.log`),'a');
  try{
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[script,...args],{cwd:root,env:{...process.env,REGIONS_WORKERS:process.env.REGIONS_WORKERS??'2'},stdio:['ignore',log,log]});
      child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error(`${stage} failed (${code??signal}); see its log`)));
    });
  }finally{fs.closeSync(log);}
}
async function campaign(mode){
  stage=mode;status('running');
  const frozen=path.join(directories[mode],'runtime/scripts/campaign.mjs');
  const args=[mode,directories[mode]];
  if(mode==='verification')args.push(path.join(directories.selection,'report.json'));
  await command(fs.existsSync(frozen)?frozen:path.join(root,'scripts/campaign.mjs'),args);
}
async function report(){
  stage='report';status('running');
  await command(path.join(root,'scripts/campaign-report.mjs'),[path.join(root,'reports',runName),...Object.values(directories)]);
}
try{
  if(waitPidArgument){
    const pid=Number(waitPidArgument);
    if(!Number.isSafeInteger(pid)||pid<=1||pid===process.pid)throw Error('Invalid existing verification PID');
    stage='waiting-for-verification';status('running');
    // Signal 0 only checks whether our existing MCTS process still exists.
    for(;;){
      try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')break;throw error;}
      await new Promise(resolve=>setTimeout(resolve,10000));
    }
  }
  await campaign('verification');
  stage='publish-selection';status('running');
  await command(path.join(root,'scripts/publish-mcts.mjs'),['selection',directories.verification]);
  await report();
  await campaign('league');
  stage='publish-ratings';status('running');
  await command(path.join(root,'scripts/publish-mcts.mjs'),['ratings',directories.league]);
  await report();
  await campaign('equilibrium');
  await report();
  stage='measurements-complete';status('complete');
}catch(error){status('failed',error.stack);throw error;}
finally{releaseLock();}
