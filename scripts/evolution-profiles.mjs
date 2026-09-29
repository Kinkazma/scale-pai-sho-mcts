/** Seeded elitist mutation/selection. Fitness is actual match outcome, not a
 * heuristic score pretending to be a win. Search/evaluation genes only. */
import {StableRng} from '../src/search.mjs';
import {RETAINED_SEARCH,retainedProfile} from '../src/search-memory.mjs';
export const GENES={candidates:[1,4,8,16],rolloutDepth:[0,2,4,6,8],widening:[.75,1,1.5,2,3],
  exploration:[.5,1,Math.SQRT2,2,3],horizonWeight:[.25,.5,1,2],scoreScale:[8,16,24,48],reuseTree:[false,true]};
export const BASE_PROFILE=retainedProfile({id:'regions-retained-seed-v1',searchVersion:RETAINED_SEARCH});
export function profileKey(profile){return JSON.stringify(Object.fromEntries(Object.keys(GENES).map(k=>[k,profile[k]])));}
export function population(parent,generation,count,seed){
  const rng=new StableRng(BigInt(seed)+BigInt(generation)*1000000007n),result=[parent],seen=new Set([profileKey(parent)]);
  const genes=Object.keys(GENES);
  while(result.length<=count){
    const child={...parent,id:`evo-g${generation}-c${result.length}${parent.id===`evo-g${generation}-c${result.length}`?'-new':''}`},mutations=1+rng.index(3);
    for(let i=0;i<mutations;i++){
      const name=genes[rng.index(genes.length)],choices=GENES[name].filter(v=>v!==child[name]);
      child[name]=choices[rng.index(choices.length)];
    }
    const key=profileKey(child);if(seen.has(key))continue;seen.add(key);result.push(retainedProfile(child));
  }
  return result;
}
export function matchScore(game){return game.result.winner===null?.5:game.result.winner===game.candidateSide?1:0;}
export function summary(games){
  const points=games.reduce((n,g)=>n+matchScore(g),0),pairs=new Map();
  for(const g of games){const group=pairs.get(g.pair)??[];group.push(g);pairs.set(g.pair,group);}
  const paired=[...pairs.values()].map(pair=>{
    if(pair.length!==2||new Set(pair.map(g=>g.candidateSide)).size!==2)throw Error('Incomplete reversed-seat pair');
    return pair.reduce((n,g)=>n+matchScore(g),0)/2;
  });
  const seconds=[0,0];for(const g of games){seconds[0]+=g.statistics.searchSeconds[g.candidateSide];seconds[1]+=g.statistics.searchSeconds[1-g.candidateSide];}
  return {games:games.length,pairs:paired.length,wins:games.filter(g=>matchScore(g)===1).length,draws:games.filter(g=>matchScore(g)===.5).length,
    losses:games.filter(g=>matchScore(g)===0).length,scoreRate:games.length?points/games.length:null,
    candidateSeconds:seconds[0],opponentSeconds:seconds[1],costRatio:seconds[1]?seconds[0]/seconds[1]:null,pairedScores:paired};
}
export function confirmation(games,budgets,alpha=.05,maxCostRatio=1.25){
  return budgets.map(budget=>{
    const s=summary(games.filter(g=>g.budget===budget));
    // One fixed final look, independent confirmation seeds. Paired observations
    // in [0,1], union bound over budgets; no precision inferred from selection.
    const radius=s.pairs?Math.sqrt(Math.log(2*budgets.length/alpha)/(2*s.pairs)):1;
    const lower=Math.max(0,(s.scoreRate??0)-radius),upper=Math.min(1,(s.scoreRate??1)+radius);
    return {budget,...s,lower,upper,eligible:lower>.5&&s.costRatio!==null&&s.costRatio<=maxCostRatio};
  });
}
