import {retainedProfile,RETAINED_SEARCH} from './search-memory.mjs';
import {RELATION_FEATURES} from './triangle-relations.mjs';
export const RELATIONAL_SEARCH='relational-solver-v2';
export const DEFAULT_WEIGHTS=Object.freeze({pairPotential:.15,reconfiguration:.25,availableRegions:.5,
  activeRegions:.25,latentPressure:.05,reachablePressure:.25,mobility:.15,stableInfluence:.2,reserveFlexibility:.15});
export function relationalProfile(input={}){
  const {weights,...rest}=input;
  const base=retainedProfile({...rest,searchVersion:RETAINED_SEARCH,rolloutDepth:Math.min(rest.rolloutDepth??0,16)});
  const p={...base,...rest,searchVersion:RELATIONAL_SEARCH,weights:{...DEFAULT_WEIGHTS,...weights},
    tacticalDepth:input.tacticalDepth??2,tacticalNodes:input.tacticalNodes??8,tacticalWidth:input.tacticalWidth??2,
    tacticalOrdering:input.tacticalOrdering??true};
  for(const [key,max]of [['rolloutDepth',32],['tacticalDepth',32],['tacticalNodes',128],['tacticalWidth',8]])
    if(!Number.isInteger(p[key])||p[key]<0||p[key]>max||(key==='tacticalWidth'&&p[key]===0))throw Error(`Invalid ${key}`);
  if(Object.keys(p.weights).some(k=>!RELATION_FEATURES.includes(k)))throw Error('Unknown relation weight');
  for(const weight of Object.values(p.weights))if(!Number.isFinite(weight)||Math.abs(weight)>4)throw Error('Invalid relation weight');
  if(typeof p.tacticalOrdering!=='boolean')throw Error('Invalid tacticalOrdering');
  return Object.freeze({...p,weights:Object.freeze(p.weights)});
}
