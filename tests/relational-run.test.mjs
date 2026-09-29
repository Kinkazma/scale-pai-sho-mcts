import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publicationProposal} from '../scripts/publish-relational.mjs';
import {registerFamily} from '../scripts/evolution-family.mjs';

test('family ledger allocates unique indices, rejects reuse and preserves resume identity',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'scale-families-')),ledger=path.join(tmp,'families.json');
 try{
  assert.equal(registerFamily(ledger,path.join(tmp,'a')),1);assert.equal(registerFamily(ledger,path.join(tmp,'b')),2);
  assert.equal(registerFamily(ledger,path.join(tmp,'a')),1);assert.throws(()=>registerFamily(ledger,path.join(tmp,'c'),1));
  assert.throws(()=>registerFamily(ledger,path.join(tmp,'a'),2));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('relational evolution completes, resumes exact journals and refuses tiny-sample publication',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'scale-relational-')),output=path.join(tmp,'run'),config=path.join(tmp,'config.json');
 fs.writeFileSync(config,JSON.stringify({generations:1,offspring:1,selectionPairsPerBudget:2,confirmationPairsPerBudget:1,
  budgets:[8],limits:[15],workers:1,seed:4349,maxActiveSeconds:120,familyRegistry:path.join(tmp,'families.json')}));
 const run=script=>spawnSync(process.execPath,[script,output,config],{encoding:'utf8',timeout:150000});
 try{
  const r=run(fileURLToPath(new URL('../scripts/evolve-relational.mjs',import.meta.url)));assert.equal(r.status,0,r.stderr);
  const status=JSON.parse(fs.readFileSync(path.join(output,'status.json')));
  assert.equal(status.complete,true);assert.equal(status.history['8'].length,2);
  assert.equal(status.history['8'][1].id,'relational-seed-b8');
  const files=fs.readdirSync(path.join(output,'games')),bytes=files.map(f=>fs.readFileSync(path.join(output,'games',f),'utf8'));
  assert.equal(files.length,14);
  const second=run(path.join(output,'runtime/scripts/evolve-relational.mjs'));assert.equal(second.status,0,second.stderr);
  assert.deepEqual(files.map(f=>fs.readFileSync(path.join(output,'games',f),'utf8')),bytes);
  // The number of workers changes scheduling, never moves, outcomes or search counters.
  const parallel=path.join(tmp,'parallel');
  fs.writeFileSync(config,JSON.stringify({...JSON.parse(fs.readFileSync(config)),workers:5}));
  const multi=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/evolve-relational.mjs',import.meta.url)),parallel,config],{encoding:'utf8',timeout:150000});
  assert.equal(multi.status,0,multi.stderr);
  const withoutTimes=body=>{
   const r=JSON.parse(body);delete r.statistics.seconds;delete r.statistics.searchSeconds;
   if(r.statistics.repetition)delete r.statistics.repetition.seconds;return r;
  };
  assert.deepEqual(files.map(f=>withoutTimes(fs.readFileSync(path.join(parallel,'games',f),'utf8'))),bytes.map(withoutTimes));
  const proposal=publicationProposal(output);assert.deepEqual(proposal.eligible,[]);assert.deepEqual(proposal.proposed.profiles,proposal.previous.profiles);
  const candidateFile=path.join(output,'candidate.json'),candidate=JSON.parse(fs.readFileSync(candidateFile));
  candidate.assessment[0].eligible=true;fs.writeFileSync(candidateFile,JSON.stringify(candidate));assert.deepEqual(publicationProposal(output).eligible,[]);
  const target=path.join(output,'games',files.find(f=>f.startsWith('confirmation-')));fs.appendFileSync(target,' ');
  assert.throws(()=>publicationProposal(output),/hash mismatch/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
