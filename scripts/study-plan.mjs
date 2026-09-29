import {RULES,LIMITS,MCTS_BUDGETS} from '../src/engine.mjs';
import {profileForBudget} from '../src/search.mjs';
export function studyPlan(){
 const budgets=MCTS_BUDGETS.filter(b=>b<=1024),jobs=[];
 for(const budget of budgets)for(const [li,limit]of LIMITS.entries()){
  const count=50;
  for(const hemispheres of [false,true])for(let i=0;i<count;i++){
   const jadeHemisphere=hemispheres&&i%2?'south':'north';
   const options={hemispheres,jadeHemisphere,compensationSide:0};
   const id=`mcts-${budget}-turns-${limit}-${hemispheres?jadeHemisphere:'open'}-${i}`;
   jobs.push({id,replicate:i,budget,profile:profileForBudget(budget),limit,options,seed:51000000+li*100000+i*7919,compensation:0});
  }
 }
 jobs.sort((a,b)=>a.replicate-b.replicate||a.limit-b.limit||Number(a.options.hemispheres)-Number(b.options.hemispheres)||a.budget-b.budget);
 return {protocol:'regions-context-study-v2',rules:RULES,profiles:Object.fromEntries(budgets.map(b=>[b,profileForBudget(b)])),budgets,limits:LIMITS,gamesPerBudget:500,games:jobs.length,compensationTarget:0,jobs};
}
