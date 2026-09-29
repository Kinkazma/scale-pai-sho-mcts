/** Independent evolutionary lineages per search budget. No neural training. */
import {validatePools,opponentRng,drawOpponent} from './reference-pool.mjs';
import {policyOptions} from './sequential-evidence.mjs';
import {rotationOptions} from './sequential-rotation.mjs';
import {RULES,LIMITS,MCTS_BUDGETS} from '../src/engine.mjs';
import {StableRng,profileForBudget} from '../src/search.mjs';
import {relationalProfile,DEFAULT_WEIGHTS} from '../src/relational-profile.mjs';
import {summary,confirmation} from './evolution-profiles.mjs';
import {createSearchSession} from '../src/search-runtime.mjs';
export const GENES={candidates:[1,4,8,16],rolloutDepth:[0,2,4,8,12,16,32],widening:[.75,1,1.5,2,3],
  exploration:[.5,1,Math.SQRT2,2,3],horizonWeight:[.25,.5,1,2],scoreScale:[8,16,24,48],reuseTree:[false,true],
  tacticalDepth:[0,2,4,8,12,16,32],tacticalNodes:[0,4,8,16,32],tacticalWidth:[1,2,4],tacticalOrdering:[false,true],
  ...Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map(k=>['weight:'+k,[-1,-.5,0,.05,.15,.25,.5,1,2]]))};
export const profileKey=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='id').sort(([a],[b])=>a.localeCompare(b))));
export function options(input={}){
  const p={generations:3,offspring:7,elites:2,selectionPairsPerBudget:16,confirmationPairsPerBudget:64,
    budgets:[8,16,32,64,128,256],limits:LIMITS,workers:2,seed:9272027,maxActiveSeconds:1800,
    familyIndex:1,maxCostRatio:1.25,...input};
  for(const [key,lo,hi]of [['generations',1,1000],['offspring',1,32],['elites',2,8],['selectionPairsPerBudget',2,10000],
    ['confirmationPairsPerBudget',1,10000],['workers',1,64],['maxActiveSeconds',1,129600],['familyIndex',1,1000000]])
    if(!Number.isInteger(p[key])||p[key]<lo||p[key]>hi)throw Error(`Invalid ${key}`);
  if(!Number.isSafeInteger(p.seed)||p.seed<0)throw Error('Invalid seed');
  if(!Number.isFinite(p.maxCostRatio)||p.maxCostRatio<=0)throw Error('Invalid cost bound');
  if(p.absoluteDeadline!==undefined&&(!Number.isFinite(p.absoluteDeadline)||p.absoluteDeadline<=0))throw Error('Invalid absolute deadline');
  if(!Array.isArray(p.budgets)||!p.budgets.length||new Set(p.budgets).size!==p.budgets.length||p.budgets.some(b=>!MCTS_BUDGETS.includes(b)))throw Error('Invalid budgets');
  if(!Array.isArray(p.limits)||!p.limits.length||p.limits.some(l=>!LIMITS.includes(l)))throw Error('Invalid limits');
  validatePools(p);
  if(p.referencesByBudget)for(const b of p.budgets){
    const reference=p.referencesByBudget[b];if(!reference||!/^[a-zA-Z0-9_-]+$/.test(reference.id??''))throw Error('Invalid training reference');
    createSearchSession(reference);
  }
  if(p.initialParentsByBudget)for(const b of p.budgets){
    const parents=p.initialParentsByBudget[b];
    if(!Array.isArray(parents)||parents.length<2||parents.length>8||new Set(parents.map(x=>x.id)).size!==parents.length)throw Error('Invalid initial parents');
    for(const parent of parents){if(!/^[a-zA-Z0-9_-]+$/.test(parent.id))throw Error('Invalid parent id');createSearchSession(parent);}
  }
  if(p.initialHistoryByBudget)for(const b of p.budgets){
    const history=p.initialHistoryByBudget[b]??[];
    if(!Array.isArray(history)||history.length>16)throw Error('Invalid initial history');
    for(const profile of history)createSearchSession(profile);
  }
  if(p.sequentialValidation){
    p.sequentialValidation=policyOptions(p.sequentialValidation);
    if(p.sequentialValidation.rotation)p.sequentialValidation.rotation=rotationOptions(p.sequentialValidation.rotation);
    if(p.budgets.length!==1&&!p.sequentialValidation.riskByBudget)throw Error('Sequential lanes require per-budget risk');
    for(const b of p.budgets)if(!(p.sequentialValidation.riskByBudget?.[b]>0&&p.sequentialValidation.riskByBudget[b]<.05))throw Error('Invalid risk allocation');
    if(typeof p.sequentialValidation.root!=='string'||!p.sequentialValidation.root.startsWith('/'))throw Error('Absolute validation archive required');
  }
  return p;
}
export function initialPlan(config){
  return {protocol:config.sequentialValidation?'regions-relational-evolution-v3-sequential':'regions-relational-evolution-v2',rules:RULES,config,
    references:Object.fromEntries(config.budgets.map(b=>[b,config.referencesByBudget?.[b]??profileForBudget(b)])),
    genes:GENES,confirmation:config.sequentialValidation??{alpha:.05/(config.familyIndex*(config.familyIndex+1)),
      method:'One final holdout, paired Hoeffding across budgets, summable family allocation by campaign index',maxCostRatio:config.maxCostRatio}};
}
export function initialParents(plan){
  if(plan.config.initialParentsByBudget)return structuredClone(plan.config.initialParentsByBudget);
  return Object.fromEntries(plan.config.budgets.map(b=>[b,[plan.references[b],
    relationalProfile({id:`relational-seed-b${b}`})]]));
}
export function population(parents,generation,budget,count,seed){
  const result=[...parents],seen=new Set(result.map(profileKey)),rng=new StableRng(BigInt(seed)+BigInt(generation)*1000000007n+BigInt(budget)*7919n);
  const genes=Object.keys(GENES);let attempts=0;
  while(result.length<parents.length+count){
    if(++attempts>10000)throw Error('Mutation diversity exhausted');
    const parent=parents[(result.length-parents.length)%parents.length];
    const child={...relationalProfile(parent),weights:{...relationalProfile(parent).weights},id:`g${generation}-b${budget}-c${result.length}`};
    while(result.some(p=>p.id===child.id))child.id+='-new';
    const mutations=1+rng.index(3);
    for(let i=0;i<mutations;i++){
      const gene=genes[rng.index(genes.length)],weight=gene.startsWith('weight:'),key=weight?gene.slice(7):gene;
      const target=weight?child.weights:child,choices=GENES[gene].filter(v=>v!==target[key]);target[key]=choices[rng.index(choices.length)];
    }
    const profile=relationalProfile(child),key=profileKey(profile);if(seen.has(key))continue;seen.add(key);result.push(profile);
  }
  return result;
}
export function jobsFor(plan,phase,generation,byBudget,history={}){
  const p=plan.config,holdout=phase==='confirmation',jobs=[];
  const pairs=holdout?p.confirmationPairsPerBudget:p.selectionPairsPerBudget;
  const streams=Object.fromEntries(p.budgets.map(b=>[b,new StableRng(BigInt(p.seed)+BigInt(b)*7919n+BigInt(generation)*10000019n+(holdout?4000000000000000000n:2000000000000000000n))]));
  const opponentStreams=Object.fromEntries(p.budgets.map(b=>[b,opponentRng(BigInt(p.seed)+BigInt(b)*7919n+BigInt(generation)*10000019n+(holdout?4000000000000000000n:2000000000000000000n))]));
  for(let pairIndex=0;pairIndex<pairs;pairIndex++)for(const budget of p.budgets){
    const rng=streams[budget],limit=p.limits[rng.index(p.limits.length)],mode=rng.index(3),seed=rng.next().toString();
    const context={hemispheres:mode>0,jadeHemisphere:mode===2?'south':'north',compensationSide:0},past=history[budget]??[];
    const selected=p.referencePoolByBudget?.[budget]?drawOpponent(p.referencePoolByBudget[budget],opponentStreams[budget]):null;
    const opponent=selected?.profile??(!holdout&&pairIndex%2&&past.length?past[rng.index(past.length)]:plan.references[budget]);
    for(const candidate of byBudget[budget])for(const candidateSide of [0,1]){
      const pair=`${phase}-g${generation}-b${budget}-${candidate.id}-p${pairIndex}`;
      jobs.push({id:`${pair}-s${candidateSide}`,pair,phase,generation,candidateId:candidate.id,candidateSide,budget,limit,seed,options:context,
        profiles:candidateSide===0?[candidate,opponent]:[opponent,candidate],...(selected?{referenceMember:selected.referenceMember}:{})});
    }
  }
  return jobs;
}
export function selectElites(candidates,games,count){
  return candidates.map((profile,index)=>({profile,index,...summary(games.filter(g=>g.candidateId===profile.id))}))
    .sort((a,b)=>b.scoreRate-a.scoreRate||a.index-b.index).slice(0,count);
}
export function assess(plan,games){return confirmation(games,plan.config.budgets,plan.confirmation.alpha,plan.config.maxCostRatio);}
