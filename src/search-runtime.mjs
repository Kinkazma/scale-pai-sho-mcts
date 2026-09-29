/** Runtime dispatcher: old profiles keep exactly their historical evaluator. */
import {createSearchSession as legacySession,StableRng,profileForBudget} from './search.mjs';
import {RELATIONAL_SEARCH} from './relational-profile.mjs';
import {RelationalSearch} from './search-relational.mjs';
import {relationalValue} from './relational-value.mjs';
import {REPETITION_POLICY,RepetitionGuardSession} from './repetition-guard.mjs';
export function createSearchSession(profile){
  if(profile.repetitionPolicy!==undefined&&profile.repetitionPolicy!==REPETITION_POLICY)throw Error('Unknown repetition policy');
  const session=profile.searchVersion===RELATIONAL_SEARCH?new RelationalSearch(profile,{Rng:StableRng,evaluate:relationalValue}):legacySession(profile);
  return profile.repetitionPolicy===REPETITION_POLICY?new RepetitionGuardSession(session):session;
}
export function search(state,budget=32,seed=1,profile=profileForBudget(budget)){
  return createSearchSession(profile).search(state,budget,seed);
}
