import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {relationalProfile} from '../src/relational-profile.mjs';
import {publicationProposal} from '../scripts/publish-relational.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('real sequential rounds, completed transaction crash recovery, exact journals and identity checks',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scale-sequential-run-')),risk=path.join(root,'risk');fs.mkdirSync(risk);
 fs.writeFileSync(path.join(risk,'allocation.json'),JSON.stringify({protocol:'scale-sequential-risk-transfer-v1',budgets:{8:.001}}));
 let config={generations:1,offspring:1,selectionPairsPerBudget:2,confirmationPairsPerBudget:1,budgets:[8],limits:[15],workers:2,seed:4349,maxActiveSeconds:120,
  familyRegistry:path.join(root,'unused-families.json'),sequentialValidation:{root:risk,riskByBudget:{8:.001}}};
 if(process.env.SCALE_TEST_ROTATION==='1'){config.generations=2;config.sequentialValidation.rotation={};}
 if(process.env.SCALE_TEST_REFERENCE_POOL==='1')config.referencePoolByBudget={8:[{label:'G1',profile:{id:'first',candidates:8,rolloutDepth:0}},{label:'G2',profile:relationalProfile({id:'second'})},{label:'G3',profile:relationalProfile({id:'third',exploration:.5})}]};
 const cfg=path.join(root,'config.json'),outputs=[];
 const run=out=>{fs.writeFileSync(cfg,JSON.stringify(config));const r=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/evolve-relational.mjs',import.meta.url)),out,cfg],{encoding:'utf8',timeout:120000});assert.equal(r.status,0,r.stderr);};
 try{
  for(let i=0;i<3;i++){
   const out=path.join(root,'round-'+i);outputs.push(out);run(out);const st=read(path.join(out,'status.json'));assert.equal(st.complete,true);
   assert.equal(st.protocol,'regions-relational-evolution-v3-sequential');assert.equal(st.assessment[0].eligible,false);
   assert.deepEqual(publicationProposal(out).eligible,[]);
   if(i<2)config={...config,seed:config.seed+100003,initialParentsByBudget:st.elites,initialHistoryByBudget:st.history};
  }
  const out=outputs.at(-1),file=path.join(risk,'budget-8.json'),before=fs.readFileSync(file),journals=fs.readdirSync(path.join(out,'games')).map(f=>[f,sha(path.join(out,'games',f))]);
  run(out);assert.deepEqual(fs.readFileSync(file),before);for(const [f,h]of journals)assert.equal(sha(path.join(out,'games',f)),h);
  // Crash after the saved finished result but before global ledger commit.
  fs.writeFileSync(file,JSON.stringify(read(path.join(outputs[1],'validation-result.json')).ledger));
  run(out);assert.deepEqual(read(file),JSON.parse(before));
  const input=read(path.join(out,'validation-input.json')),result=read(path.join(out,'validation-result.json'));
  assert.ok(result.ledger.validationPairs>0);
  if(config.referencePoolByBudget){assert.equal(result.assessment.scope,'score-against-frozen-mixture');assert.equal(Object.values(result.assessment.byReference).reduce((s,x)=>s+x.pairs,0),result.assessment.pairs);}
  const d=Object.values(result.ledger.dossiers).find(d=>d.pairs.length),receipt=d.pairs[0].games[0],original=fs.readFileSync(receipt.path),record=JSON.parse(original);
  record.agents.seed='123';fs.writeFileSync(receipt.path,JSON.stringify(record));receipt.sha256=sha(receipt.path);
  // Direct verification rejects wrong game identity even with a matching SHA.
  const script=`import {verifyDossier} from './scripts/sequential-validation.mjs';verifyDossier(${JSON.stringify(d)},${JSON.stringify(read(path.join(out,'plan.json')))});`;
  const bad=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});assert.notEqual(bad.status,0);assert.match(bad.stderr,/identity mismatch/);
  fs.writeFileSync(receipt.path,original);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
