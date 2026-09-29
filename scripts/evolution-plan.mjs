import {RULES,LIMITS,MCTS_BUDGETS} from '../src/engine.mjs';
import {StableRng,profileForBudget} from '../src/search.mjs';
import {retainedProfile} from '../src/search-memory.mjs';
export function options(input={}){
  const p={generations:2,offspring:3,selectionPairs:16,confirmationPairsPerBudget:64,
    budgets:[8,16,32,64,128,256,512,1024],limits:LIMITS,workers:2,seed:9272026,maxActiveSeconds:1800,...input};
  for(const [k,lo,hi]of [['generations',1,1000],['offspring',1,32],['selectionPairs',1,10000],['confirmationPairsPerBudget',1,10000],['workers',1,8],['maxActiveSeconds',1,86400]])
    if(!Number.isInteger(p[k])||p[k]<lo||p[k]>hi)throw Error(`Invalid ${k}`);
  if(!Number.isSafeInteger(p.seed)||p.seed<0)throw Error('Invalid seed');
  if(!Array.isArray(p.budgets)||!p.budgets.length||new Set(p.budgets).size!==p.budgets.length||p.budgets.some(b=>!MCTS_BUDGETS.includes(b)||b>1024))throw Error('Expected unique budgets 8..1024');
  if(!Array.isArray(p.limits)||!p.limits.length||p.limits.some(l=>!LIMITS.includes(l)))throw Error('Invalid turn limits');
  if(p.selectionPairs<p.budgets.length)throw Error('Selection must cover every budget');
  if(p.initialProfile)p.initialProfile=retainedProfile(p.initialProfile);
  if(p.initialHistory){if(!Array.isArray(p.initialHistory)||p.initialHistory.length>64)throw Error('Invalid initial history');p.initialHistory=p.initialHistory.map(retainedProfile);}
  return p;
}
export function initialPlan(config){
  return {protocol:'regions-evolution-v1',rules:RULES,config,
    references:Object.fromEntries(config.budgets.map(b=>[b,profileForBudget(b)])),
    confirmation:{method:'fixed-look paired Hoeffding, familywise 95%',maxCostRatio:1.25},
    publication:'only eligible budgets after complete independent confirmation; explicit evidence artifact'};
}
export function jobsFor(plan,phase,generation,candidates,history=[]){
  const p=plan.config,confirmation=phase==='confirmation';
  const rng=new StableRng(BigInt(p.seed)+(confirmation?4000000000000000000n:2000000000000000000n)+BigInt(generation)*10000019n);
  const pairs=confirmation?p.confirmationPairsPerBudget*p.budgets.length:p.selectionPairs,jobs=[];
  for(let i=0;i<pairs;i++){
    const budget=p.budgets[i%p.budgets.length],limit=p.limits[rng.index(p.limits.length)],mode=rng.index(3);
    const context={hemispheres:mode>0,jadeHemisphere:mode===2?'south':'north',compensationSide:0};
    const seed=rng.next().toString();
    // Alternate by the occurrence OF EACH budget, not by the flat pair index:
    // otherwise some budgets would see only old champions and others none.
    const opponent=!confirmation&&history.length&&Math.floor(i/p.budgets.length)%2===1?history[rng.index(history.length)]:plan.references[budget];
    for(const candidate of candidates)for(const candidateSide of [0,1]){
      const pair=`${phase}-g${generation}-${candidate.id}-p${i}`;
      jobs.push({id:`${pair}-s${candidateSide}`,pair,phase,generation,candidateId:candidate.id,candidateSide,budget,limit,seed,options:context,
        profiles:candidateSide===0?[candidate,opponent]:[opponent,candidate]});
    }
  }
  return jobs;
}
