import {RULES,LIMITS} from '../src/engine.mjs';
import {profileForBudget} from '../src/search.mjs';

export const budgets=[8,16,32,64,128,256,512,1024];
export const contexts=LIMITS.flatMap(limit=>[
  {limit,options:{hemispheres:false,jadeHemisphere:'north',compensationSide:0}},
  {limit,options:{hemispheres:true,jadeHemisphere:'north',compensationSide:0}},
  {limit,options:{hemispheres:true,jadeHemisphere:'south',compensationSide:0}},
]);
export function leaguePlan(){
  const jobs=[];let pair=0;
  for(let a=0;a<budgets.length;a++)for(let b=a+1;b<budgets.length;b++)for(const context of contexts){
    const players=[budgets[a],budgets[b]],profiles=players.map(profileForBudget),seed=71000000+pair*7919;
    for(const swap of [false,true])jobs.push({id:`league-${pair}-${Number(swap)}`,pair,swap,...context,seed,players:swap?[...players].reverse():players,profiles:swap?[...profiles].reverse():profiles,compensation:0});
    pair++;
  }
  return {protocol:'regions-fixed-league-v1',rules:RULES,budgets,contexts,jobs,games:jobs.length};
}
export function verificationPlan(selection){
  if(!selection.complete)throw Error('Selection is incomplete');
  const jobs=[],proposals={};let pair=0;
  for(const budget of budgets){
    let best={profile:selection.plan.reference,rate:.5};
    for(const row of selection.profiles){
      const result=row.byBudget.find(r=>r.budget===budget);
      if(result?.scoreRate>best.rate)best={profile:row.profile,rate:result.scoreRate};
    }
    proposals[budget]=best.profile;
    if(best.profile.id===selection.plan.reference.id)continue;
    for(const context of contexts){
      const profiles=[selection.plan.reference,best.profile],seed=81000000+pair*7919;
      for(const swap of [false,true])jobs.push({id:`verify-${pair}-${Number(swap)}`,pair,swap,budget,...context,seed,players:[budget,budget],profiles:swap?[...profiles].reverse():profiles,compensation:0,candidateSide:swap?0:1});
      pair++;
    }
  }
  return {protocol:'regions-fixed-verification-v1',rules:RULES,budgets,contexts,reference:selection.plan.reference,proposals,jobs,games:jobs.length};
}
export function selectVerifiedProfiles(report){
  if(!report.complete)throw Error('Verification is incomplete');
  return Object.fromEntries(budgets.map(budget=>{
    const games=report.games.filter(g=>g.budget===budget);
    const points=games.reduce((sum,g)=>sum+(g.result.winner===null?.5:g.result.winner===g.candidateSide?1:0),0);
    return [budget,games.length&&points>games.length/2?report.plan.proposals[budget]:report.plan.reference];
  }));
}
