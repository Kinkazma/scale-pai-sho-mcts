import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {hash,weights,policyOptions} from '../scripts/sequential-evidence.mjs';
import {identity,prepareRound,finishRound,validationJobs,freshLedger,atomic} from '../scripts/sequential-ledger.mjs';
import {hypothesis,rotationOptions} from '../scripts/sequential-rotation.mjs';
import {migrateLedger} from '../scripts/migrate-sequential-rotation.mjs';
const ref={id:'ref',weights:{a:0}},old={id:'old',weights:{a:1}},next={id:'next',weights:{a:2}};
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'scale-rotation-'));atomic(root+'/allocation.json',{protocol:'scale-sequential-risk-transfer-v1',budgets:{8:.001}});
 const plan={rules:'test',sources:{'src/engine.mjs':'engine','scripts/sequential-evidence.mjs':'evidence','scripts/sequential-ledger.mjs':'scheduler'},references:{8:ref},config:{budgets:[8],limits:[15,20,30],sequentialValidation:policyOptions({root,riskByBudget:{8:.001},rotation:rotationOptions({})})}};
 return {root,plan,ledger:freshLedger(plan,8)};}
function selection(profile=next,generations=[1,2]){return generations.flatMap(generation=>Array.from({length:54},(_,i)=>[0,1].map(candidateSide=>({id:`g${generation}-p${i}-s${candidateSide}`,pair:`g${generation}-p${i}`,generation,candidateSide,profiles:candidateSide?[ref,profile]:[profile,ref],result:{winner:candidateSide},statistics:{searchSeconds:[1,1]}}))).flat());}
function games(input){return input.jobs.map(j=>({...j,file:j.id+'.json',sha256:'test',result:{winner:0},statistics:{searchSeconds:[1,1]}}));}
function seed(s,plan,profile=old,n=72){const key=identity(plan,8,profile);s.dossiers[key]={key,hypothesisKey:hypothesis(plan,8,profile),identitySources:plan.sources,index:s.nextIndex++,alpha:.0005,profile,reference:ref,referenceHash:hash(weights(ref)),state:'pending',lastServedLot:0,pairs:Array.from({length:n},()=>({score:.5,candidateSeconds:1.32,opponentSeconds:1,wins:1,losses:1,draws:0}))};s.active=key;return key;}
test('rotation frees weak incumbent, requires recurrent finalists and preserves every receipt/risk',()=>{const {root,plan,ledger}=setup();try{
 const key=seed(ledger,plan),original=structuredClone(ledger.dossiers[key]);
 const a=prepareRound(plan,8,next,selection(),'/round-a',ledger);assert.notEqual(a.key,key);assert.equal(a.jobs.length,16);assert.equal(a.afterSelection.dossiers[a.key].profile.id,'next');assert.deepEqual(a.afterSelection.dossiers[key],original);
 let result=finishRound(a,games(a));assert.equal(result.assessment.eligible,false);assert.equal(result.ledger.nextIndex,3);
 for(let i=2;i<=5;i++){const b=prepareRound(plan,8,next,selection(),'/round-'+i,result.ledger);assert.equal(b.key,i===5?key:a.key);result=finishRound(b,games(b));}
 assert.equal(result.ledger.dossiers[key].pairs.length,80);assert.equal(result.ledger.dossiers[key].alpha,original.alpha);assert.equal(result.ledger.nextIndex,3);
 assert.ok(result.ledger.validationPairs/(result.ledger.selectionPairs+result.ledger.validationPairs)<=.1);
 const again=prepareRound(plan,8,next,selection(),'/round-6',result.ledger);assert.equal(again.key,a.key);assert.equal(again.afterSelection.rotation.lastChoice.reason,'no-ready-alternative');
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('weak dossiers cannot alternate around revisit quota; revisit restores displaced active outside selection window',()=>{const {root,plan,ledger}=setup();try{
 const a=seed(ledger,plan,old),b=seed(ledger,plan,next);ledger.active=a;
 const third={id:'third',weights:{a:3}},lots=[...selection(old),...selection(next),...selection(third)];
 // The third candidate must recur in top2; weaken old selection outcomes.
 for(const g of lots)if(g.profiles[g.candidateSide].id!=='third')g.result.winner=null;
 const chosen=prepareRound(plan,8,third,lots,'/new',ledger);assert.notEqual(chosen.key,a);assert.notEqual(chosen.key,b);assert.equal(chosen.afterSelection.dossiers[chosen.key].profile.id,'third');
 let s=finishRound(chosen,games(chosen)).ledger;s.rotation.servedLots=4;s.rotation.lastRevisitLot=0;
 s.dossiers[chosen.key].lastServedLot=4; // Active remains initial (8 pairs).
 const revisit=prepareRound(plan,8,old,selection(old),'/revisit',s);assert.equal(revisit.key,a);
 s=finishRound(revisit,games(revisit)).ledger;s.rotation.lots=[];
 const restored=prepareRound(plan,8,old,selection(old,[1]),'/restore',s);assert.equal(restored.key,chosen.key);assert.equal(restored.afterSelection.rotation.lastChoice.reason,'continue-promising-or-initial');
 const empty=finishRound(revisit,[]).ledger;assert.equal(empty.rotation.servedLots,4);assert.equal(empty.rotation.returnKey,chosen.key);
 // No completed revisit: next attempt still remembers whom it interrupted.
 const retry=prepareRound(plan,8,old,selection(old,[1]),'/retry',empty);assert.equal(retry.afterSelection.rotation.lastChoice.returnKey,chosen.key);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('single appearance does not allocate risk; same lot is not counted twice',()=>{const {root,plan,ledger}=setup();try{
 let a=prepareRound(plan,8,next,selection(next,[1]),'/one',ledger);assert.equal(a.key,null);assert.equal(a.afterSelection.nextIndex,1);
 let s=finishRound(a,[]).ledger;a=prepareRound(plan,8,next,selection(next,[1]),'/one',s);assert.equal(a.key,null);assert.equal(a.afterSelection.rotation.lots.length,1);
 a=prepareRound(plan,8,next,selection(next,[1]),'/two',s);assert.ok(a.key);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('promising incumbent continues; weak incumbent without alternative keeps its evidence moving',()=>{const {root,plan,ledger}=setup();try{
 const key=seed(ledger,plan);for(const p of ledger.dossiers[key].pairs)p.candidateSeconds=1;
 for(const p of ledger.dossiers[key].pairs)p.score=.75;
 let a=prepareRound(plan,8,next,selection(),'/a',ledger);assert.equal(a.key,key);
 for(const p of ledger.dossiers[key].pairs)p.score=.5;
 a=prepareRound(plan,8,old,selection(old),'/b',ledger);assert.equal(a.key,key);assert.equal(a.jobs.length,16);assert.equal(a.afterSelection.rotation.lastChoice.reason,'no-ready-alternative');
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('reference change resets selection recurrence, rename keeps hypothesis, engine change does not',()=>{const {root,plan,ledger}=setup();try{
 const a=prepareRound(plan,8,next,selection(next,[1]),'/a',ledger),s=finishRound(a,[]).ledger;
 assert.equal(hypothesis(plan,8,next),hypothesis(plan,8,{...next,id:'clone'}));
 const changed=structuredClone(plan);changed.sources['scripts/sequential-ledger.mjs']='new scheduler';assert.equal(hypothesis(plan,8,next),hypothesis(changed,8,next));
 changed.sources['src/engine.mjs']='other';assert.notEqual(hypothesis(plan,8,next),hypothesis(changed,8,next));
 plan.references[8]={id:'new-ref',weights:{a:9}};const b=prepareRound(plan,8,next,selection(next,[2]),'/b',s);assert.equal(b.key,null);assert.equal(b.afterSelection.rotation.lots.length,1);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('migration preserves stream, risk and key across scheduler changes, rejects semantic change',()=>{const {root,plan}=setup();try{
 const oldPlan=structuredClone(plan);delete oldPlan.config.sequentialValidation.rotation;oldPlan.sources['scripts/sequential-ledger.mjs']='old scheduler';
 const before=freshLedger(oldPlan,8),key=seed(before,oldPlan,old,0);delete before.dossiers[key].hypothesisKey;delete before.dossiers[key].identitySources;delete before.dossiers[key].lastServedLot;
 const migrated=migrateLedger(before,[oldPlan],plan,[]);assert.equal(migrated.nextIndex,before.nextIndex);assert.equal(migrated.dossiers[key].alpha,before.dossiers[key].alpha);
 assert.deepEqual(validationJobs(oldPlan,8,before.dossiers[key],8),validationJobs(plan,8,migrated.dossiers[key],8));
 const bad=structuredClone(plan);bad.sources['scripts/sequential-evidence.mjs']='changed';assert.throws(()=>migrateLedger(before,[oldPlan],bad,[]),/semantics/);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('empty budgets do not advance revisit clock or spend new alpha; initial 24 pairs get their fourth lot',()=>{const {root,plan,ledger}=setup();try{
 const key=seed(ledger,plan,old,24);const a=prepareRound(plan,8,next,selection(),'/initial',ledger);assert.equal(a.key,key);
 let s=finishRound(a,games(a)).ledger;assert.equal(s.dossiers[key].pairs.length,32);assert.equal(s.rotation.servedLots,1);
 s.validationPairs=100000;s.validationSeconds=1e9;const beforeIndex=s.nextIndex;
 for(let i=0;i<8;i++){const x=prepareRound(plan,8,next,selection(),'/empty'+i,s);assert.equal(x.jobs.length,0);s=finishRound(x,[]).ledger;}
 assert.equal(s.rotation.servedLots,1);assert.equal(s.nextIndex,beforeIndex);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
