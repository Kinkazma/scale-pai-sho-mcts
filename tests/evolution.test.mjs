import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_PROFILE,population,profileKey,confirmation} from '../scripts/evolution-profiles.mjs';
import {options,initialPlan,jobsFor} from '../scripts/evolution-plan.mjs';
test('mutation is reproducible, diverse and retains the parent exactly',()=>{
  const a=population(BASE_PROFILE,1,5,37),b=population(BASE_PROFILE,1,5,37);
  assert.deepEqual(a,b);assert.equal(a[0],BASE_PROFILE);assert.equal(new Set(a.map(profileKey)).size,6);
  assert.notDeepEqual(a,population(BASE_PROFILE,2,5,37));
});
test('paired seats share seeds/context/opponent, budgets are covered and confirmation is distinct',()=>{
  const plan=initialPlan(options({budgets:[8,32],selectionPairs:8,confirmationPairsPerBudget:32}));
  const candidates=population(BASE_PROFILE,1,2,37),jobs=jobsFor(plan,'selection',1,candidates),holdout=jobsFor(plan,'confirmation',0,[candidates[0]]);
  assert.equal(jobs.length,48);assert.equal(holdout.length,128);
  for(let i=0;i<jobs.length;i+=2){const[a,b]=jobs.slice(i,i+2);assert.equal(a.pair,b.pair);assert.equal(a.seed,b.seed);assert.deepEqual(a.profiles,[...b.profiles].reverse());assert.deepEqual(a.options,b.options);}
  const seeds=new Set(jobs.map(j=>j.seed));assert.ok(holdout.every(j=>!seeds.has(j.seed)));
  assert.deepEqual([...new Set(jobs.map(j=>j.budget))],[8,32]);
  assert.throws(()=>options({budgets:[8,8]}));
});
test('confirmation rejects incomplete pairs, noise, and excessive cost',()=>{
  const plan=initialPlan(options({budgets:[8],selectionPairs:8,confirmationPairsPerBudget:64}));
  const jobs=jobsFor(plan,'confirmation',0,[BASE_PROFILE]);
  const games=jobs.map(j=>({...j,result:{winner:j.candidateSide},statistics:{searchSeconds:[1,1]}}));
  assert.equal(confirmation(games,[8])[0].eligible,true);
  assert.equal(confirmation(games.map(g=>({...g,result:{winner:null}})),[8])[0].eligible,false);
  assert.equal(confirmation(games.map(g=>({...g,statistics:{searchSeconds:g.candidateSide===0?[10,1]:[1,10]}})),[8])[0].eligible,false);
  assert.throws(()=>confirmation(games.slice(1),[8]),/Incomplete/);
});
test('every budget meets both the reference and an ancestor when two pairs are available',()=>{
  const plan=initialPlan(options()),ancestor={...BASE_PROFILE,id:'ancestor'};
  const jobs=jobsFor(plan,'selection',2,[BASE_PROFILE],[ancestor]);
  for(const budget of plan.config.budgets){
    const opponents=jobs.filter(j=>j.budget===budget).map(j=>j.profiles[1-j.candidateSide].id);
    assert.ok(opponents.includes('ancestor'));assert.ok(opponents.includes(plan.references[budget].id));
  }
});

test('a resumed lineage preserves its profile and history without candidate ID collisions',()=>{
 const parent={...BASE_PROFILE,id:'evo-g1-c2',widening:2},ancestor={...BASE_PROFILE,id:'ancestor'};
 const p=options({initialProfile:parent,initialHistory:[ancestor]});
 assert.equal(p.initialProfile.widening,2);assert.deepEqual(p.initialHistory,[ancestor]);
 const candidates=population(p.initialProfile,1,3,9272026);
 assert.equal(new Set(candidates.map(c=>c.id)).size,candidates.length);
 assert.deepEqual(candidates[0],parent);
 assert.throws(()=>options({initialProfile:{...parent,widening:NaN}}));
});
