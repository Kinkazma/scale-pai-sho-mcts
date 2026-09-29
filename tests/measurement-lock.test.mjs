import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {acquireMeasurementLock} from '../scripts/measurement-lock.mjs';

test('measurement lock rejects a live owner and recovers after its process exits',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'regions-lock-')),file=path.join(directory,'run.lock');
  try{
    const release=acquireMeasurementLock(file);
    assert.throws(()=>acquireMeasurementLock(file),/already running/);
    release();assert.equal(fs.existsSync(file),false);
    const child=spawn(process.execPath,['-e',''],{stdio:'ignore'});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    fs.writeFileSync(file,String(child.pid));
    const recovered=acquireMeasurementLock(file);
    assert.equal(fs.readFileSync(file,'utf8'),String(process.pid));
    recovered();assert.equal(fs.existsSync(file),false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
