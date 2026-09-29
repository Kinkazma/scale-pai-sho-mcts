import {score,cumulativeDifference} from './engine.mjs';
import {valueRelations} from './triangle-relations.mjs';
import {searchValue} from './search.mjs';
export function relationalValue(state,root,terminal=false,profile){
  if(terminal||!Object.values(profile.weights).some(Boolean))return searchValue(state,root,terminal,profile);
  const features=valueRelations(state).features;
  let adjustment=0;
  for(const [name,weight]of Object.entries(profile.weights))adjustment+=weight*(features[root][name]-features[1-root][name]);
  const s=score(state).scores,banked=cumulativeDifference(state,root);
  const remaining=Math.max(0,2*state.turnLimit-state.ply);
  return Math.tanh((banked+remaining*((s[root].total-s[1-root].total)*profile.horizonWeight+adjustment))
    /(profile.scoreScale*Math.max(1,remaining)));
}
