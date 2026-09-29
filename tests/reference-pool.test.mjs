import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {options,initialPlan,jobsFor} from '../scripts/evolution-relational-plan.mjs';
import {referenceHash,drawOpponent,opponentRng} from '../scripts/reference-pool.mjs';
import {identity,validationJobs,freshLedger,prepareRound,finishRound,atomic} from '../scripts/sequential-ledger.mjs';
import {hypothesis,rotationOptions} from '../scripts/sequential-rotation.mjs';
import {policyOptions} from '../scripts/sequential-evidence.mjs';
import {verifyDossier} from '../scripts/sequential-validation.mjs';
const profile=i=>({id:'p'+i,candidates:8,rolloutDepth:0,exploration:i+1});
const pool=[0,1,2].map(i=>({label:'G'+(i+1),profile:profile(i)}));
function plan(extra={}){return {...initialPlan(options({budgets:[8,32],referencePoolByBudget:{8:pool,32:pool},selectionPairsPerBudget:60,seed:711,...extra})),sources:{'src/engine.mjs':'engine','scripts/reference-pool.mjs':'pool'}};}
test('mixed selection uses one independent opponent per pair for all candidates and both seats, no history leakage',()=>{
 const p=plan(),by={8:[profile(3),profile(4)],32:[profile(3),profile(4)]},history={8:[profile(99)],32:[profile(99)]};
 const all=jobsFor(p,'selection',1,by,history);assert.deepEqual(all,jobsFor(p,'selection',1,by,{}));
 for(const b of [8,32]){
  const rows=all.filter(j=>j.budget===b);assert.deepEqual(new Set(rows.map(j=>j.referenceMember.label)),new Set(['G1','G2','G3']));
  for(let i=0;i<rows.length;i+=4){const group=rows.slice(i,i+4);assert.equal(new Set(group.map(j=>JSON.stringify(j.referenceMember))).size,1);assert.equal(new Set(group.map(j=>j.seed)).size,1);for(const j of group)assert.deepEqual(j.profiles[1-j.candidateSide],pool.find(e=>e.label===j.referenceMember.label).profile);}
  const single=plan({budgets:[b],referencePoolByBudget:{[b]:pool}});assert.deepEqual(rows,jobsFor(single,'selection',1,{[b]:by[b]},history));
 }
 assert.notDeepEqual(all.filter(j=>j.budget===8).map(j=>j.referenceMember.label),all.filter(j=>j.budget===32).map(j=>j.referenceMember.label));
});
test('uniform opponent stream, validation resumes exactly with the same adversaries and seeds',()=>{
 const counts=[0,0,0],rng=opponentRng(823);for(let i=0;i<3000;i++)counts[Number(drawOpponent(pool,rng).referenceMember.label.slice(1))-1]++;assert.ok(counts.every(n=>n>850&&n<1150));
 const p=plan({budgets:[8]}),d={key:identity(p,8,profile(3)),profile:profile(3),reference:p.references[8],referencePool:pool,pairs:[]};
 const all=validationJobs(p,8,d,32),resumed=validationJobs(p,8,{...d,pairs:Array(8).fill({})},24);assert.deepEqual(resumed,all.slice(16));
 for(let i=0;i<all.length;i+=2){assert.deepEqual(all[i].referenceMember,all[i+1].referenceMember);assert.deepEqual(all[i].profiles,[...all[i+1].profiles].reverse());}
});
test('pool mutation changes hypothesis, old evidence is never reused and global risk indices survive',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scale-pool-'));try{
  atomic(root+'/allocation.json',{protocol:'scale-sequential-risk-transfer-v1',budgets:{8:.001}});
  const before=plan({budgets:[8],referencePoolByBudget:undefined,sequentialValidation:{root,riskByBudget:{8:.001},rotation:rotationOptions({})}}),s=freshLedger(before,8),ref=before.references[8];
  const k=identity(before,8,profile(3));s.dossiers[k]={key:k,index:7,alpha:.001/56,profile:profile(3),reference:ref,referenceHash:referenceHash(before,8),pairs:[],state:'pending'};s.active=k;s.nextIndex=8;
  const p=plan({budgets:[8],referencesByBudget:{8:profile(2)},sequentialValidation:s.policy}),old=structuredClone(s.dossiers[k]);
  const selected=jobsFor(p,'selection',1,{8:[profile(2)]}).concat(jobsFor(p,'selection',2,{8:[profile(2)]})).map(j=>({...j,result:{winner:j.candidateSide},statistics:{searchSeconds:[1,1]}}));
  const a=prepareRound(p,8,profile(2),selected,'/new',s);assert.notEqual(a.key,k);assert.equal(a.afterSelection.nextIndex,9);assert.deepEqual(a.afterSelection.dossiers[k],old);assert.equal(a.afterSelection.dossiers[a.key].index,8);assert.equal(a.afterSelection.dossiers[a.key].alpha,.001/72);assert.equal(a.jobs.length,16);
  const result=finishRound(a,a.jobs.map(j=>({...j,file:j.id+'.json',sha256:'test',result:{winner:j.candidateSide},statistics:{searchSeconds:[1,1]}})));
  assert.equal(result.assessment.scope,'score-against-frozen-mixture');assert.equal(Object.values(result.assessment.byReference).reduce((n,v)=>n+v.pairs,0),8);
  for(const mutation of ['weight','order','label']){const changed=structuredClone(p);const pp=changed.config.referencePoolByBudget[8];if(mutation==='weight')pp[0].profile.exploration=99;if(mutation==='order')pp.reverse();if(mutation==='label')pp[0].label='other';assert.notEqual(identity(changed,8,profile(3)),identity(p,8,profile(3)));assert.notEqual(hypothesis(changed,8,profile(3)),hypothesis(p,8,profile(3)));assert.notEqual(referenceHash(changed,8),referenceHash(p,8));}
  assert.throws(()=>verifyDossier(s.dossiers[k],p),/identity/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('frozen pool config refuses automatic replacement and malformed labels',()=>{
 assert.throws(()=>plan({advanceTrainingReferences:true}),/cannot advance/);
 assert.throws(()=>plan({referencePoolByBudget:{8:[pool[0],pool[0]],32:pool}}),/Invalid/);
});
