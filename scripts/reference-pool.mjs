/** Frozen, equally weighted opponents. A draw applies to a whole reversed-seat pair. */
import {StableRng} from '../src/search.mjs';
import {createSearchSession} from '../src/search-runtime.mjs';
import {hash,weights} from './sequential-evidence.mjs';
export function validatePools(config){
 if(!config.referencePoolByBudget)return;
 if(config.advanceTrainingReferences)throw Error('Frozen reference pool cannot advance automatically');
 for(const budget of config.budgets){
  const pool=config.referencePoolByBudget[budget];
  if(!Array.isArray(pool)||pool.length<2||pool.length>16||new Set(pool.map(x=>x.label)).size!==pool.length)throw Error('Invalid reference pool');
  for(const entry of pool){
   if(!/^[a-zA-Z0-9_-]+$/.test(entry.label??'')||!entry.profile||!/^[a-zA-Z0-9_-]+$/.test(entry.profile.id??''))throw Error('Invalid pool member');
   createSearchSession(entry.profile);
  }
 }
}
export function referenceIdentity(plan,budget){
 const pool=plan.config.referencePoolByBudget?.[budget];
 return pool?{method:'uniform-paired-reference-pool-v1',members:pool.map(e=>({label:e.label,profile:weights(e.profile)}))}:weights(plan.references[budget]);
}
export const referenceHash=(plan,budget)=>hash(referenceIdentity(plan,budget));
// Keep opponent draws separate from the seeds/limits used to play the games.
export const opponentRng=seed=>new StableRng(BigInt(seed)+9000000000000000000n);
export function drawOpponent(pool,rng){
 const entry=pool[rng.index(pool.length)];
 return {profile:entry.profile,referenceMember:{label:entry.label,profileHash:hash(weights(entry.profile))}};
}
