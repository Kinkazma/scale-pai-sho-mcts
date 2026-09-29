import test from 'node:test';
import assert from 'node:assert/strict';
import {options,initialPlan,initialParents,population,profileKey,jobsFor,selectElites,assess,GENES} from '../scripts/evolution-relational-plan.mjs';
test('relational genes include all weights and real tactical budgets, with reproducible retained parents',()=>{
 const plan=initialPlan(options({budgets:[8,32]})),parents=initialParents(plan)[8];
 const a=population(parents,1,8,4,33),b=population(parents,1,8,4,33);
 assert.deepEqual(a,b);assert.equal(a[0],parents[0]);assert.equal(a[1],parents[1]);assert.equal(new Set(a.map(profileKey)).size,6);
 assert(GENES.rolloutDepth.includes(32));assert(GENES.tacticalDepth.includes(16));assert(GENES['weight:reconfiguration']);
});
test('each budget selects its own elites from paired comparisons and gets its own holdout',()=>{
 const plan=initialPlan(options({budgets:[8,32],selectionPairsPerBudget:4,confirmationPairsPerBudget:4})),parents=initialParents(plan);
 const candidates=Object.fromEntries([8,32].map(b=>[b,population(parents[b],1,b,1,77)]));
 const jobs=jobsFor(plan,'selection',1,candidates),games=jobs.map(j=>({...j,result:{winner:j.candidateId===candidates[j.budget][j.budget===8?0:1].id?j.candidateSide:1-j.candidateSide},statistics:{searchSeconds:[1,1]}}));
 const winners={};for(const b of [8,32]){const elites=selectElites(candidates[b],games.filter(j=>j.budget===b),2);assert.equal(elites.length,2);winners[b]=[elites[0].profile];}
 assert.equal(winners[8][0],candidates[8][0]);assert.equal(winners[32][0],candidates[32][1]);
 const holdout=jobsFor(plan,'confirmation',0,winners),seeds=new Set(jobs.map(j=>j.seed));assert(holdout.every(j=>!seeds.has(j.seed)));
 for(let i=0;i<jobs.length;i+=2){assert.equal(jobs[i].pair,jobs[i+1].pair);assert.deepEqual(jobs[i].profiles,[...jobs[i+1].profiles].reverse());}
 assert(assess(plan,games.filter(j=>j.candidateId===winners[j.budget][0].id)).every(a=>!a.eligible));
});
test('confirmation family allocation is summable across successive explicitly indexed campaigns',()=>{
 let alpha=0;for(let i=1;i<=100;i++)alpha+=initialPlan(options({familyIndex:i})).confirmation.alpha;
 assert(alpha<.05);assert(alpha>.049);assert.throws(()=>options({familyIndex:0}));
});
test('a resumed lineage cannot give a mutant the identifier of a retained parent',()=>{
 const parents=initialParents(initialPlan(options({budgets:[8]})))[8].map((p,i)=>({...p,id:`g1-b8-c${i+2}`}));
 const candidates=population(parents,1,8,4,33);
 assert.equal(new Set(candidates.map(p=>p.id)).size,candidates.length);
 assert.deepEqual(candidates.slice(0,2),parents);
});
test('two retained parents and seven offspring give nine profiles and preserve the first three mutations',()=>{
 const p=options({budgets:[8]});assert.equal(p.offspring,7);assert.equal(p.elites,2);
 const parents=initialParents(initialPlan(p))[8],wide=population(parents,2,8,7,73),old=population(parents,2,8,3,73);
 assert.equal(wide.length,9);assert.deepEqual(wide.slice(0,5),old);assert.equal(new Set(wide.map(profileKey)).size,9);
});
test('36-hour independent campaigns accept ten workers and explicit training references',()=>{
 const refs=Object.fromEntries([8,32].map(b=>[b,{...initialParents(initialPlan(options({budgets:[b]})))[b][1],id:`training-${b}`}])) ;
 const config=options({budgets:[8,32],workers:10,maxActiveSeconds:129600,referencesByBudget:refs});
 const plan=initialPlan(config);assert.deepEqual(plan.references,refs);
 const jobs=jobsFor(plan,'confirmation',0,Object.fromEntries([8,32].map(b=>[b,[refs[b]]])));
 assert(jobs.every(j=>j.profiles[1-j.candidateSide].id===`training-${j.budget}`));
 assert.throws(()=>options({...config,maxActiveSeconds:129601}));
 assert.throws(()=>options({...config,referencesByBudget:{8:refs[8]}}));
 assert.throws(()=>options({...config,absoluteDeadline:NaN}));
});
