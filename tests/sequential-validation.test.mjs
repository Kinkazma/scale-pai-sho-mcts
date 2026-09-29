import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {evidence,decision,policyOptions,pairFacts,hash} from '../scripts/sequential-evidence.mjs';
import {freshLedger,prepareRound,finishRound,atomic} from '../scripts/sequential-ledger.mjs';
const profile={id:'first',weights:{a:1}},ref={id:'ref',weights:{a:0}};
function plan(root){return {rules:'test',sources:{'src/engine.mjs':'abc'},references:{8:ref},config:{budgets:[8],limits:[15,20,30],sequentialValidation:{root,riskByBudget:{8:.001},...policyOptions({})}}};}
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'scale-seq-'));atomic(path.join(root,'allocation.json'),{protocol:'scale-sequential-risk-transfer-v1',budgets:{8:.001}});return {root,p:plan(root)};}
function pair(id,won=true){return [0,1].map(side=>({id:id+'-s'+side,pair:id,candidateSide:side,result:{winner:won?side:1-side},statistics:{searchSeconds:[1,1]}}));}
function results(input,win=true){return input.jobs.map(job=>({...job,file:job.id+'.json',sha256:'hash',result:{winner:win?job.candidateSide:1-job.candidateSide},statistics:{searchSeconds:[1,1]}}));}
test('paired score handles draws, correlations and refuses missing/reversed legs',()=>{
 assert.equal(pairFacts(pair('a')).score,1);assert.equal(pairFacts(pair('a',false)).score,0);
 const p=pair('a');p[0].result.winner=null;assert.equal(pairFacts(p).score,.75);
 assert.throws(()=>pairFacts(p.slice(0,1)));assert.throws(()=>pairFacts([...p].reverse()));
});
test('evidence is not a win-rate cutoff: accumulates and is exact on null-neutral pairs',()=>{
 assert.equal(evidence(Array(128).fill(.5),.001).logE,0);
 assert.equal(evidence(Array(16).fill(1),.0001).passed,false);
 assert.equal(evidence(Array(32).fill(1),.0001).passed,true);
 // Exhaust all short IID Bernoulli-null paths: E-process expectation exactly one.
 for(const n of [1,4,10]){let sum=0;for(let k=0;k<2**n;k++)sum+=Math.exp(evidence(Array.from({length:n},(_,i)=>(k>>i)&1),.05).logE);assert.ok(Math.abs(sum/2**n-1)<1e-12);}
});
test('cost and futility filters never manufacture a statistical pass',()=>{
 const policy=policyOptions({});const d={alpha:.001,pairs:Array.from({length:64},()=>({score:1,candidateSeconds:2,opponentSeconds:1,wins:2,draws:0,losses:0}))};
 assert.equal(decision(d,policy).state,'cost-rejected');
 d.pairs.forEach(p=>{p.score=.5;p.candidateSeconds=1;});assert.equal(decision(d,policy).state,'pending');
 d.pairs=Array(128).fill(d.pairs[0]);assert.equal(decision(d,policy).state,'inconclusive');
});
test('persistent challenger survives other champions, credits once, caps games and keeps its own profile',()=>{
 const {root,p}=setup();try{
  let ledger=freshLedger(p,8);const selection=Array.from({length:108},(_,i)=>pair('sel'+i)).flat();
  const a=prepareRound(p,8,profile,selection,'round-a',ledger);assert.equal(a.jobs.length,16);
  const first=finishRound(a,results(a));assert.equal(first.ledger.nextIndex,2);assert.equal(first.ledger.validationPairs,8);
  assert.deepEqual(finishRound(a,results(a)),first); // replay of same transaction has no extra credit
  const b=prepareRound(p,8,{id:'new',weights:{a:2}},selection,'round-b',first.ledger);
  assert.equal(b.key,a.key);assert.equal(b.jobs[0].profiles[0].weights.a,1);
  const second=finishRound(b,results(b));assert.equal(second.ledger.selectionPairs,216);assert.equal(second.ledger.validationPairs,16);
  assert.equal(second.ledger.nextIndex,2);assert.deepEqual(second.acceptedProfile,profile);assert.equal(second.assessment.eligible,true);assert.ok(second.ledger.validationPairs/(second.ledger.selectionPairs+second.ledger.validationPairs)<=.1);
  const unordered=results(a);[unordered[0],unordered[2]]=[unordered[2],unordered[0]];
  assert.deepEqual(finishRound(a,unordered),first); // completion order cannot alter evidence
  assert.throws(()=>finishRound(a,results(a).slice(2)),/prefix/);
  assert.throws(()=>finishRound(a,results(a).slice(0,1)),/Incomplete/);
  const clone=prepareRound(p,8,{id:'renamed',weights:{a:1}},selection,'round-c',first.ledger);assert.equal(clone.key,a.key);
  // Closed uncertain dossiers are not reset or reallocated under a new name.
  const closed=structuredClone(second.ledger);closed.active=null;closed.dossiers[a.key].state='inconclusive';
  assert.equal(prepareRound(p,8,{id:'clone',weights:{a:1}},selection,'round-d',closed).jobs.length,0);
  // Changing reference does not silently continue the old hypothesis.
  p.references[8]={id:'ref2',weights:{a:3}};const changed=prepareRound(p,8,profile,selection,'round-e',second.ledger);
  assert.notEqual(changed.key,a.key);assert.equal(changed.afterSelection.nextIndex,3);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('historical risk transfer is unique, budget-specific and blocks new old-format trials',()=>{
 const {root}=setup();try{
  const ledger=path.join(root,'families.json'),dest=path.join(root,'risk');atomic(ledger,{old:39});
  const script=fileURLToPath(new URL('../scripts/allocate-sequential-risk.py',import.meta.url));
  const run=d=>spawnSync('python3',[script,ledger,d,'8','32'],{encoding:'utf8'});
  const a=run(dest);assert.equal(a.status,0,a.stderr);const allocation=JSON.parse(a.stdout);
  assert.equal(allocation.remainingRisk,.05/40);assert.equal(allocation.budgets['8'],.05/80);
  assert.equal(run(dest).stdout,a.stdout);assert.notEqual(run(path.join(root,'other')).status,0);
  const newFamily=spawnSync('python3',[fileURLToPath(new URL('../scripts/family-registry.py',import.meta.url)),ledger,path.join(root,'new'),'null'],{encoding:'utf8'});assert.notEqual(newFamily.status,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
