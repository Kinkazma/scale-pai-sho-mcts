/** Strategic opportunities, not proofs. Rules remain authoritative for reactions.
 * Geometry is shared across positions; full-state facts use an immutable-state cache. */
import {POINTS,pointAt,owner,trianglePoints,analyze,score,canPlaceAt,sideToMove} from './engine.mjs';
const pairs=new Map(),states=new WeakMap(),compactStates=new WeakMap(),valueStates=new WeakMap(),boards=new WeakMap();
// Only physical features are shared by content. Values, visits, RNG and scores
// are not: their dependencies include the complete game state and the profile.
const physicalValues=new Map();
export const relationCacheStatistics={hits:0,misses:0};
const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
const moves=POINTS.map(p=>[[],...[1,2,3].map(n=>directions.flatMap(([dx,dy])=>{
  const path=Array.from({length:n},(_,i)=>pointAt(p.x+(i+1)*dx,p.y+(i+1)*dy));
  return path.every(q=>q!==undefined)?[path]:[];
}))]);
export function pairCompletions(a,b){
  const key=Math.min(a,b)*128+Math.max(a,b);
  if(!pairs.has(key)){
    const options=[];
    for(let p=0;p<POINTS.length;p++)if(p!==a&&p!==b){const inside=trianglePoints(a,b,p);if(inside){
      const mask=[0,0,0,0];for(const q of inside)mask[q>>>5]|=1<<(q&31);
      const option={point:p,inside};Object.defineProperty(option,'mask',{value:mask});options.push(option);
    }}
    pairs.set(key,options);
  }
  return pairs.get(key);
}
const actionKey=a=>JSON.stringify(a);
const blank=()=>({pairPotential:0,reconfiguration:0,availableRegions:0,activeRegions:0,
  latentPressure:0,reachablePressure:0,mobility:0,stableInfluence:0,reserveFlexibility:0});
export const RELATION_FEATURES=Object.freeze(Object.keys(blank()));

export const positionRelations=state=>readRelations(state,'full');
export const evaluationRelations=state=>readRelations(state,'tactical');
export const valueRelations=state=>readRelations(state,'value');
function readRelations(state,mode){
  const details=mode==='full',valuesOnly=mode==='value';
  const stateCache=details?states:valuesOnly?valueStates:compactStates;
  if(stateCache.has(state))return stateCache.get(state);
  // Scores, elapsed turns and action quotas do not change these physical facts.
  // Declared regions/activity, stocks and available reactions do.
  const signature=JSON.stringify([mode,state.selected,state.regionActivity,state.reserve,state.hemispheres,state.jadeHemisphere,state.resolution?.side,state.resolution?.options.length]);
  let boardFacts=boards.get(state.board);if(!boardFacts){boardFacts=new Map();boards.set(state.board,boardFacts);}
  if(boardFacts.has(signature)){
    const result={...boardFacts.get(signature),decisionSide:sideToMove(state)};stateCache.set(state,result);return result;
  }
  const physicalKey=valuesOnly?state.board.join(',')+'|'+signature:null;
  if(valuesOnly&&physicalValues.has(physicalKey)){
    const result={...physicalValues.get(physicalKey),decisionSide:sideToMove(state)};
    relationCacheStatistics.hits++;boardFacts.set(signature,result);stateCache.set(state,result);return result;
  }
  if(valuesOnly)relationCacheStatistics.misses++;
  const analysis=analyze(state),scoring=score(state),groups=Array.from({length:2},()=>[[],[],[],[]]);
  const pieces=[],destinations=new Map(),features=[blank(),blank()],plans=[new Map(),new Map()];
  state.board.forEach((tile,point)=>{
    if(!tile)return;const side=owner(tile),type=Math.abs(tile);
    groups[side][type].push(point);
    const reachable=analysis.frozen.has(point)?[]:moves[point][type].filter(path=>
      !analysis.territory[1-side].has(path.at(-1))&&path.every(q=>!state.board[q])).map(path=>path.at(-1));
    destinations.set(point,new Set(reachable));
    pieces.push({point,side,type,frozen:analysis.frozen.has(point),reachable});
    features[side].mobility+=reachable.length/8;
  });
  const pairRelations=[[],[]],trios=[[],[]],latent=[new Set(),new Set()],reachable=[new Set(),new Set()];
  for(let side=0;side<2;side++){
    const enemy=1-side,activeRegions=analysis.regions[side].filter(r=>r.status==='active'),activeVertices=new Set(activeRegions.flatMap(r=>r.vertices));
    const capturable=new Set(pieces.filter(p=>p.side===enemy&&!p.frozen).map(p=>p.point));
    const unpaid=analysis.regions[enemy].filter(r=>!r.vertices.some(p=>analysis.frozen.has(p)));
    const victimCache=new Map();
    const victimValue=points=>{
      if(victimCache.has(points))return victimCache.get(points);
      const victims=points.filter(p=>capturable.has(p));
      let value=4*victims.length;for(const r of unpaid)if(r.vertices.some(p=>victims.includes(p)))value+=4;
      const result={victims,value};victimCache.set(points,result);return result;
    };
    const reachableMask=[0,0,0,0];
    const addPlan=(action,vertices,inside,mask)=>{
      if(valuesOnly){reachableMask[0]|=mask[0];reachableMask[1]|=mask[1];reachableMask[2]|=mask[2];reachableMask[3]|=mask[3];return;}
      const {victims,value}=victimValue(inside),key=actionKey(action),previous=plans[side].get(key);
      victims.forEach(p=>reachable[side].add(p));
      // Alternatives are not simultaneous captures. Keep the strongest per action.
      if(!previous||value>previous.captureValue)plans[side].set(key,{action,vertices,inside,victims,captureValue:value});
    };
    if(details)for(const a of groups[side][1])for(const b of groups[side][2])for(const c of groups[side][3]){
      const vertices=[a,b,c],inside=trianglePoints(a,b,c);
      trios[side].push({vertices,inside,reconfigurations:[]});
    }
    const trioMap=new Map(trios[side].map(t=>[[...t.vertices].sort((a,b)=>a-b).join(','),t])),reconfigured=new Set(),latentMask=[0,0,0,0];
    for(const [one,two,missing] of [[1,2,3],[1,3,2],[2,3,1]])for(const a of groups[side][one])for(const b of groups[side][two]){
      const completions=pairCompletions(a,b),usable=!analysis.frozen.has(a)&&!analysis.frozen.has(b);
      const available=state.reserve[side][missing]>0||groups[side][missing].length>0;
      const movers=usable?groups[side][missing].filter(from=>!activeRegions.some(r=>
        (r.vertices.includes(a)||r.vertices.includes(b))&&!r.vertices.includes(from))).map(from=>({
        from,destinations:destinations.get(from),key:[a,b,from].sort((a,b)=>a-b).join(','),wasTriangle:!!trianglePoints(a,b,from)})):[];
      let potential=false;
      for(const option of completions){
        const p=option.point;if(state.board[p])continue;
        if(available){potential=true;const m=option.mask;
          latentMask[0]|=m[0];latentMask[1]|=m[1];latentMask[2]|=m[2];latentMask[3]|=m[3];}
        if(!usable||analysis.territory[enemy].has(p))continue;
        if(!activeVertices.has(a)&&!activeVertices.has(b)&&state.reserve[side][missing]>0&&canPlaceAt(state,side,p))addPlan([-missing,p],[a,b,p],option.inside,option.mask);
        for(const mover of movers)if(mover.destinations.has(p)){
          const {from,key,wasTriangle}=mover;
          if(details)trioMap.get(key).reconfigurations.push({from,to:p,inside:option.inside});
          if(!wasTriangle)reconfigured.add(key);
          addPlan([from,p],[a,b,p],option.inside,option.mask);
        }
      }
      if(details)pairRelations[side].push({vertices:[a,b],missingType:missing,completions,endpointsMobile:usable,resourceAvailable:available});
      if(potential)features[side].pairPotential++;
    }
    for(const q of capturable)if(latentMask[q>>>5]&(1<<(q&31)))latent[side].add(q);
    if(valuesOnly)for(const q of capturable)if(reachableMask[q>>>5]&(1<<(q&31)))reachable[side].add(q);
    features[side].reconfiguration=reconfigured.size;
    features[side].activeRegions=analysis.regions[side].filter(r=>r.status==='active').length;
    features[side].availableRegions=state.resolution?.side===side?state.resolution.options.length:0;
    features[side].latentPressure=victimValue([...latent[side]]).value;
    features[side].reachablePressure=victimValue([...reachable[side]]).value;
    features[side].reserveFlexibility=state.reserve[side].slice(1).filter(n=>n>0).length;
    scoring.influenceCounts.forEach(([a,b])=>{const margin=side===0?a-b:b-a;if(margin>=2)features[side].stableInfluence++;});
  }
  const result={pieces,pairs:pairRelations,trios,regions:analysis.regions,features,plans,
    exposure:valuesOnly?[]:pieces.map(p=>({point:p.point,latent:latent[1-p.side].has(p.point),reachable:reachable[1-p.side].has(p.point)})),
    scope:'Geometry and fresh-turn physical opportunities. Suspension, replacement and current quotas can prevent execution; only legal actions and rule transitions establish it.',
    decisionSide:sideToMove(state)};
  if(valuesOnly){
    if(physicalValues.size>=4096)physicalValues.delete(physicalValues.keys().next().value);
    physicalValues.set(physicalKey,result);
  }
  boardFacts.set(signature,result);stateCache.set(state,result);return result;
}

/** Rank only supplied LEGAL actions. A potential is a search hint, never a proof. */
export function tacticalPriority(state,action,relations=positionRelations(state)){
  if(action[0]==='region')return 100;
  if(action[0]==='decline')return 10;
  const side=sideToMove(state),plan=relations.plans[side].get(actionKey(action));
  let priority=plan?2+plan.captureValue:0;
  if(typeof action[0]==='number'&&action[0]>=0){
    const exposed=relations.exposure.find(p=>p.point===action[0]);
    if(exposed?.reachable)priority+=8;
  }
  // Include ending the turn so the opponent's imminent reply can be examined.
  if(action[0]==='end-turn'&&relations.features[1-side].reachablePressure>0)priority=1;
  return priority;
}
