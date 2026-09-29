import test from 'node:test';
import assert from 'node:assert/strict';
import {budgets,leaguePlan,verificationPlan,selectVerifiedProfiles} from '../scripts/campaign-plan.mjs';
import {studyPlan} from '../scripts/study-plan.mjs';
import {profileForBudget} from '../src/search.mjs';

test('league covers every budget pair, duration and orientation with identical-seed reversed seats',()=>{
 const plan=leaguePlan();assert.equal(plan.games,840);
 assert.equal(new Set(plan.jobs.map(j=>j.id)).size,840);
 for(let i=0;i<plan.jobs.length;i+=2){
  const [a,b]=plan.jobs.slice(i,i+2);
  assert.equal(a.pair,b.pair);assert.equal(a.seed,b.seed);
  assert.deepEqual(a.players,[...b.players].reverse());assert.deepEqual(a.profiles,[...b.profiles].reverse());
  assert.deepEqual(a.options,b.options);assert.equal(a.limit,b.limit);
 }
 for(const a of budgets)for(const b of budgets.filter(b=>b>a)){
  const games=plan.jobs.filter(j=>j.players.includes(a)&&j.players.includes(b));assert.equal(games.length,30);
  assert.equal(games.filter(j=>!j.options.hemispheres).length,10);
  for(const direction of ['north','south'])assert.equal(games.filter(j=>j.options.hemispheres&&j.options.jadeHemisphere===direction).length,10);
 }
});
test('verification uses fresh full contexts and promotes only a better held-out result',()=>{
 const reference={id:'reference',candidates:8},candidate={id:'candidate',candidates:8,rolloutDepth:0};
 const selection={complete:true,plan:{reference},profiles:[{profile:candidate,byBudget:budgets.map(budget=>({budget,scoreRate:budget===8?.75:.5}))}]};
 const plan=verificationPlan(selection);assert.equal(plan.games,30);assert.ok(plan.jobs.every(j=>j.budget===8));
 const report={complete:true,plan,games:plan.jobs.map(j=>({...j,result:{winner:j.candidateSide}}))};
 assert.deepEqual(selectVerifiedProfiles(report)[8],candidate);
 report.games=plan.jobs.map(j=>({...j,result:{winner:null}}));assert.deepEqual(selectVerifiedProfiles(report)[8],reference);
 assert.throws(()=>selectVerifiedProfiles({...report,complete:false}));
});
test('each equilibrium job pins the selected profile of its own budget',()=>{
 const plan=studyPlan();for(const job of plan.jobs)assert.deepEqual(job.profile,profileForBudget(job.budget));
 assert.deepEqual(Object.keys(plan.profiles).map(Number),budgets);
});
