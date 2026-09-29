/** Independent Regions rules; shared with browser, workers and Node. */
import {resolveActivity} from './region-resolution.mjs';
export const RULES = 'paisho-regions-v12-local-majority';
export const LIMITS = [15,20,30,50,70];
export const MAX_ACTIVE_REGIONS = 4;
export const MCTS_BUDGETS = [8,16,32,64,128,256,512,1024,2048,4096,8192];
export const STOCK = [0, 4, 4, 4];
export const POINTS = [];
for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
  if (x*x + y*y <= 36) POINTS.push({x, y});
}
const lookup = new Map(POINTS.map((p,i) => [`${p.x},${p.y}`, i]));
export const pointAt = (x,y) => lookup.get(`${x},${y}`);
export const coordinate = i => `${POINTS[i].x},${POINTS[i].y}`;
export const owner = value => value > 0 ? 0 : 1;
const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
const neighbours = POINTS.map(p => directions.map(([dx,dy]) => pointAt(p.x+dx,p.y+dy)).filter(i => i !== undefined));
const paths = POINTS.map(p => [[], ...[1,2,3].map(n => directions.flatMap(([dx,dy]) => {
  const path = Array.from({length:n}, (_,k) => pointAt(p.x+dx*(k+1),p.y+dy*(k+1)));
  return path.every(i => i !== undefined) ? [path] : [];
}))]);
const cache = new WeakMap();
const candidateCache = new WeakMap();
const triangles = new Map();
const cross = (a,b,p) => (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);

/** Interior and edge lattice points, excluding the three defining vertices. */
export function trianglePoints(a,b,c) {
  const [i,j,k] = [a,b,c].sort((x,y)=>x-y);
  const key = i*16384+j*128+k;
  if (triangles.has(key)) return triangles.get(key);
  const A=POINTS[i], B=POINTS[j], C=POINTS[k];
  let result = [];
  if (cross(A,B,C) !== 0) {
    const minX=Math.min(A.x,B.x,C.x), maxX=Math.max(A.x,B.x,C.x);
    const minY=Math.min(A.y,B.y,C.y), maxY=Math.max(A.y,B.y,C.y);
    for (let p=0;p<POINTS.length;p++) {
      const P=POINTS[p];
      if (p===i || p===j || p===k || P.x<minX || P.x>maxX || P.y<minY || P.y>maxY) continue;
      const u=cross(A,B,P),v=cross(B,C,P),w=cross(C,A,P);
      if ((u>=0 && v>=0 && w>=0)||(u<=0 && v<=0 && w<=0)) result.push(p);
      if (result.length>5) break;
    }
  }
  if (result.length===0 || result.length>5) result=null;
  triangles.set(key,result);
  return result;
}

export function initialState(turnLimit=30, compensation=0, options={}) {
  if (!Number.isFinite(compensation)||compensation<0) throw Error('Compensation attendue : nombre positif ou nul.');
  if (!LIMITS.includes(turnLimit)) throw Error('Durée attendue : 15, 20, 30, 50 ou 70 tours.');
  const hemispheres=options.hemispheres??false,jadeHemisphere=options.jadeHemisphere??'north',compensationSide=options.compensationSide??0;
  if(typeof hemispheres!=='boolean'||!['north','south'].includes(jadeHemisphere)||![0,1].includes(compensationSide))throw Error('Options de partie invalides.');
  return {rules:RULES,hemispheres,jadeHemisphere,compensationSide,setup:hemispheres?{side:0,placed:[0,0],finished:[false,false]}:null,board:Array(POINTS.length).fill(0), reserve:[[...STOCK],[...STOCK]], ply:0, placedThisTurn:false, movesThisTurn:0, turnKind:null, credits:[0,0], turnLimit, compensation, scoreLedger:{totals:[0,0],turns:0,lastPly:-1}, regionHistory:[], regionActions:[], regionActivity:{}, loopLoss:null, selected:[[],[]], declined:[[],[]], resolution:null};
}
export const sideToMove = state => state.resolution?.side ?? state.setup?.side ?? state.ply%2;

export function canPlaceAt(state,side,p){
  if(!state.hemispheres)return true;
  const north=(side===0)===(state.jadeHemisphere==='north');
  return north?POINTS[p].y>=0:POINTS[p].y<=0;
}
function advanceSetup(state,side,placed){
 const setup={...state.setup,placed:[...state.setup.placed],finished:[...state.setup.finished]};
 if(placed)setup.placed[side]++;
 if(!placed||setup.placed[side]>=4)setup.finished[side]=true;
 if(setup.finished.every(Boolean))return null;
 setup.side=setup.finished[1-side]?side:1-side;
 return setup;
}
export const isFinalTurn = state => state.ply>=2*(state.turnLimit-1);
export const maximumActions = state => isFinalTurn(state)||state.credits[state.ply%2]<0?1:3;
function completeTurn(state){
  const side=state.ply%2,credits=state.credits.slice();
  credits[side]=Math.min(1,credits[side]+2-state.movesThisTurn);
  return {...state,ply:state.ply+1,placedThisTurn:false,movesThisTurn:0,turnKind:null,credits,resolution:null};
}
/** Only declared formations have effects. Suspensions are simultaneous, including
 * mutual enclosure; an unchosen candidate never neutralizes anything. */
const regionKey = vertices => vertices.join(',');
export function candidates(state) {
  if(candidateCache.has(state.board))return candidateCache.get(state.board);
  const groups = [[[],[],[],[]],[[],[],[],[]]];
  state.board.forEach((v,i)=>{if(v)groups[owner(v)][Math.abs(v)].push(i);});
  const result=groups.map((g,side)=>{
    const result=[];
    for(const a of g[1])for(const b of g[2])for(const c of g[3]){
      const inside=trianglePoints(a,b,c);if(!inside)continue;
      const vertices=[a,b,c].sort((a,b)=>a-b);
      result.push({side,vertices,inside,key:regionKey(vertices)});
    }
    return result;
  });
  candidateCache.set(state.board,result);
  return result;
}
/** Pure geometry helper; live transitions additionally preserve prior activity. */
export function resolveRegions(regions,previous={}) {return resolveActivity(regions,previous).regions;}
export function analyze(state) {
  if(cache.has(state))return cache.get(state);
  const all=candidates(state), selected=state.selected??[[],[]];
  const resolved=resolveActivity(all.map((rs,side)=>rs.filter(r=>selected[side].some(v=>regionKey(v)===r.key))),state.regionActivity??{});
  const regions=resolved.regions;
  const territory=[new Set(),new Set()];
  for(let side=0;side<2;side++)for(const r of regions[side]){
    if(r.status==='active')r.inside.forEach(p=>territory[side].add(p));
  }
  const frozen=new Set();
  state.board.forEach((v,p)=>{if(v&&territory[1-owner(v)].has(p))frozen.add(p);});
  const result={regions,territory,frozen,candidates:all,activity:resolved.activity,suspensionCycle:resolved.cycle};cache.set(state,result);return result;
}
function resolveTransition(before,after,action,added=null){
  const regionActivity={...analyze(before).activity};
  if(added)regionActivity[`${added.side}:${regionKey(added.vertices)}`]=true;
  const provisional={...after,regionActivity},resolved=analyze(provisional);
  const result={...provisional,regionActivity:resolved.activity};
  if(resolved.suspensionCycle)return {...result,resolution:null,loopLoss:{loser:sideToMove(before),kind:'suspension',cycle:[{side:sideToMove(before),action}],suspensionCycle:resolved.suspensionCycle}};
  return result;
}
function declare(state,side,vertices) {
  const selected=state.selected.map(rs=>rs.map(v=>v.slice()));
  // A replacement removes the former declaration as well as its effects.
  const removed=selected[side].filter(v=>v.some(p=>vertices.includes(p)));
  selected[side]=selected[side].filter(v=>!v.some(p=>vertices.includes(p)));
  selected[side].push(vertices);
  const declined=state.declined.map((rs,i)=>i===side?[...rs,...removed]:rs);
  return resolveTransition(state,{...state,selected,declined},['region',...vertices],{side,vertices});
}
function choicesFor(state,side) {
  const before=analyze(state),activeTiles=new Set(before.regions[side].filter(r=>r.status==='active').flatMap(r=>r.vertices));
  if(before.regions[side].filter(r=>r.status==='active').length>=MAX_ACTIVE_REGIONS)return [];
  const keys=new Set([...state.selected[side],...(state.declined?.[side]??[])].map(regionKey));
  return before.candidates[side].filter(r=>{
    if(keys.has(r.key)||r.vertices.some(p=>activeTiles.has(p)))return false;
    // A newly chosen declaration must have an active effect after all suspensions
    // settle. Existing declarations may still become suspended and reactivate.
    const projected=declare(state,side,r.vertices);
    return !projected.loopLoss&&analyze(projected).regions[side].some(next=>next.key===r.key&&next.status==='active');
  });

}
/** Refusal is lifted by moving a vertex OR by freeing a formerly frozen one. */
export function refreshDeclines(before,after) {
  const was=analyze(before).frozen,now=analyze(after).frozen;
  return {...after,declined:after.declined.map(rs=>rs.filter(v=>!v.some(p=>was.has(p)&&!now.has(p))))};
}
/** No quota on declarations per turn. Decisions remain with the relevant owner;
 * declining records the current candidates, not a board-action pass. */
export function regionalConfiguration(state){
  const canonical=groups=>groups.map(rs=>[...new Set(rs.map(v=>[...v].sort((a,b)=>a-b).join(',')))].sort());
  return {selected:canonical(state.selected),declined:canonical(state.declined),activity:Object.entries(analyze(state).activity).sort(([a],[b])=>a.localeCompare(b)),decision:state.resolution?.side??null};
}
export function recordRegionalDecision(before,after,action){
  const history=before.regionHistory?.length?before.regionHistory:[regionalConfiguration(before)];
  const events=[...(before.regionActions??[]),{side:sideToMove(before),action}];
  const configuration=regionalConfiguration(after),key=JSON.stringify(configuration);
  const repeated=history.findIndex(previous=>JSON.stringify(previous)===key);
  const result={...after,regionHistory:[...history,configuration],regionActions:events};
  if(repeated>=0)return {...result,resolution:null,loopLoss:{loser:events[repeated].side,kind:'decisions',cycle:events.slice(repeated)}};
  return result;
}
function settle(state,order) {
  if(state.loopLoss)return {...state,resolution:null};
  for(const side of order){
    const options=choicesFor(state,side);
    if(options.length)return {...state,resolution:{side,order,options:options.map(r=>r.vertices)}};
  }
  const resolved={...state,resolution:null};
  if(resolved.turnKind==='setup')return {...resolved,turnKind:null};
  return resolved.placedThisTurn&&resolved.movesThisTurn>=maximumActions(resolved)?completeTurn(resolved):resolved;
}

const mobilityCache=new WeakMap();
/** Physical mobility with a fresh turn's rights, never consumed turn quotas. */
export function physicalMobility(state){
  if(mobilityCache.has(state))return mobilityCache.get(state);
  const {territory,frozen}=analyze(state);
  const mobile=[0,1].map(side=>{
    const blocked=territory[1-side],canPose=state.reserve[side].some((count,tile)=>tile>0&&count>0);
    for(let p=0;p<POINTS.length;p++){
      const tile=state.board[p];
      if(!tile){if(canPose&&!blocked.has(p)&&canPlaceAt(state,side,p))return true;}
      else if(owner(tile)===side&&!frozen.has(p)&&paths[p][Math.abs(tile)].some(path=>!blocked.has(path.at(-1))&&path.every(q=>state.board[q]===0)))return true;
    }
    return false;
  });
  mobilityCache.set(state,mobile);return mobile;
}
function blockedEnding(state){
  if(state.setup||state.resolution)return null;
  const mobile=physicalMobility(state);
  return mobile.every(v=>!v)?'both-blocked':mobile.some(v=>!v)?'no-legal-action':null;
}
export function legalActions(state) {
  if(state.loopLoss)return [];
  if(state.resolution)return [...state.resolution.options.map(v=>['region',...v]),['decline']];
  if(state.ply>=state.turnLimit*2) return [];
  if(blockedEnding(state))return [];
  const side=sideToMove(state), {territory,frozen}=analyze(state), blocked=territory[1-side], result=[];
  for(let p=0;p<POINTS.length;p++) {
    const value=state.board[p];
    if(!value) {
      if(!state.placedThisTurn&&!blocked.has(p)&&canPlaceAt(state,side,p)) for(let tile=1;tile<=3;tile++) if(state.reserve[side][tile]>0) result.push([-tile,p]);
    } else if(!state.setup && state.movesThisTurn<maximumActions(state) && owner(value)===side && !frozen.has(p)) {
      for(const path of paths[p][Math.abs(value)]) {
        if(!blocked.has(path.at(-1)) && path.every(q=>state.board[q]===0)) result.push([p,path.at(-1)]);
      }
    }
  }
  if(state.setup)result.push(['finish-setup']);
  else if(state.movesThisTurn>0||state.placedThisTurn)result.push(['end-turn']);
  return result;
}

/** Internal fast transition, only for an action returned by legalActions. */
function applyLegal(state, action) {
  if(action[0]==='finish-setup')return {...state,setup:advanceSetup(state,state.setup.side,false),turnKind:null,regionHistory:[],regionActions:[]};
  if(action[0]==='end-turn')return completeTurn(state);
  if(action[0]==='decline'){
    const {side,order,options}=state.resolution;
    const declined=state.declined.map((rs,i)=>i===side?[...rs,...options]:rs);
    return recordRegionalDecision(state,settle({...state,declined},order),action);
  }
  if(action[0]==='region'){
    const {side,order}=state.resolution,vertices=action.slice(1);
    return recordRegionalDecision(state,settle(refreshDeclines(state,declare(state,side,vertices)),order),action);
  }
  const [from,to]=action,side=sideToMove(state),board=state.board.slice(),reserve=state.reserve.map(r=>r.slice());
  if(from<0){reserve[side][-from]--;board[to]=(side===0?1:-1)*(-from);}
  else{board[to]=board[from];board[from]=0;}
  let next={...state,board,reserve,setup:state.setup?advanceSetup(state,side,true):null,turnKind:state.setup?'setup':from<0?'place':'move',placedThisTurn:state.setup?false:(state.placedThisTurn||from<0),movesThisTurn:from<0?state.movesThisTurn:state.movesThisTurn+1,resolution:null};
  const valid=candidates(next).map(rs=>new Set(rs.map(r=>r.key)));
  next={...next,selected:state.selected.map((rs,i)=>rs.filter(v=>valid[i].has(regionKey(v)))),declined:state.declined.map((rs,i)=>rs.filter(v=>valid[i].has(regionKey(v))))};
  next=resolveTransition(state,next,action);
  const settled=settle({...refreshDeclines(state,next),regionHistory:[],regionActions:[]},[side,1-side]);
  return {...settled,regionHistory:settled.resolution?[regionalConfiguration(settled)]:[]};
}
/** Credit only the settled position, once per personal turn. A block closes the
 * current physical turn early; setup and intermediate reactions never earn points. */
function creditTurn(state, ply) {
  if(state.scoreLedger.lastPly>=ply)return state;
  const scores=score(state).scores,diff=scores[0].total-scores[1].total;
  const totals=state.scoreLedger.totals.map((total,side)=>total+Math.max(0,side===0?diff:-diff));
  return {...state,scoreLedger:{totals,turns:state.scoreLedger.turns+1,lastPly:ply}};
}
function settleBlockedScore(state){
  if(state.loopLoss||state.setup||state.resolution||state.turnKind==='setup'||
     (!state.placedThisTurn&&!state.movesThisTurn)||state.scoreLedger.lastPly>=state.ply)return state;
  return blockedEnding(state)?creditTurn(state,state.ply):state;
}
export function playLegal(state, action) {
  if(state.rules!==RULES)throw Error('Règles incompatibles : créez une nouvelle partie.');
  const next=applyLegal(state,action);
  if(next.loopLoss)return next;
  return next.ply>state.ply?creditTurn(next,state.ply):settleBlockedScore(next);
}
export function play(state,action) {
  if(!Array.isArray(action)||!legalActions(state).some(a=>a.length===action.length&&a.every((v,i)=>v===action[i])))throw Error('Coup interdit.');
  return playLegal(state,action);
}

const scoreCache=new WeakMap();
export function score(state) {
  if(scoreCache.has(state))return scoreCache.get(state);
  const {frozen,regions}=analyze(state);
  const regionVertices=regions.map(rs=>new Set(rs.flatMap(r=>r.vertices)));
  // Every tile, including an immobilized one, supports each empty neighbour
  // once. Piece numbers describe movement, never influence strength or range.
  const influenceCounts=POINTS.map(()=>[0,0]);
  state.board.forEach((v,p)=>{if(v)for(const q of neighbours[p])if(!state.board[q])influenceCounts[q][owner(v)]++;});
  const influence=Array(POINTS.length).fill(-1);
  const scores=[0,1].map(()=>({influence:0,regions:0,prisoners:0,frozenCount:0,vertexPrisoners:0,capturedTriangles:0,triangleBonus:0,total:0}));
  for(let p=0;p<POINTS.length;p++) {
    if(!state.board[p]) {
      const [jade,amber]=influenceCounts[p];
      if(jade!==amber) { const side=jade>amber?0:1; influence[p]=side; scores[side].influence++; }
    }
    // Regions affect movement, suspension and prisoners; their area scores nothing.
    if(frozen.has(p)) {
      const prisonerSide=owner(state.board[p]),beneficiary=scores[1-prisonerSide];
      const isVertex=regionVertices[prisonerSide].has(p);
      beneficiary.frozenCount++;beneficiary.prisoners+=4;
      if(isVertex)beneficiary.vertexPrisoners++;
    }
  }
  for(const side of [0,1]){
    const beneficiary=scores[1-side];
    beneficiary.capturedTriangles=regions[side].filter(r=>r.vertices.some(p=>frozen.has(p))).length;
    beneficiary.triangleBonus=4*beneficiary.capturedTriangles;
    beneficiary.prisoners+=beneficiary.triangleBonus;
  }
  for(const s of scores) s.total=s.influence+s.regions+s.prisoners;
  const result={scores,influence,influenceCounts};scoreCache.set(state,result);return result;
}
/** Match score, separate from the instantaneous board score. Compensation is a
 * one-off credit, never included in the per-turn difference. No state is mutated. */
export function cumulativeScore(state) {
  const ledger=settleBlockedScore(state).scoreLedger;
  return {turns:ledger.turns,scores:ledger.totals.map((earned,side)=>{
    const compensation=side===(state.compensationSide??0)?state.compensation:0;
    return {earned,compensation,total:earned+compensation};
  })};
}
export function outcome(state, actions=legalActions(state)) {
  if(state.loopLoss)return {reason:'region-loop',winner:1-state.loopLoss.loser,loser:state.loopLoss.loser,cycle:state.loopLoss.cycle,scores:cumulativeScore(state).scores};
  if(state.resolution)return null;
  const blocked=blockedEnding(state);
  const reason=blocked??(state.ply>=state.turnLimit*2?'turn-limit':null);
  if(!reason) return null;
  const {scores}=cumulativeScore(state),diff=scores[0].total-scores[1].total;
  return {reason,winner:reason==='both-blocked'||diff===0?null:diff>0?0:1,scores};
}
export function describe(action) {
  if(action[0]==='finish-setup')return 'Terminer le placement initial';
  if(action[0]==='end-turn')return 'Fin du tour';
  if(action[0]==='decline')return 'Ne pas créer d’autres régions';
  if(action[0]==='region')return `Région : ${action.slice(1).map(p=>`(${coordinate(p)})`).join(' · ')}`;
  return action[0]<0 ? `Pose ${-action[0]} → (${coordinate(action[1])})` : `(${coordinate(action[0])}) → (${coordinate(action[1])})`;
}
export function makeRecord(turnLimit,actions,agents=null,compensation=0,options={}) {
  const record={rules:RULES,turnLimit,compensation,options,agents,actions};
  const states=replay(record);
  return {...record,result:outcome(states.at(-1))};
}
export function replay(record) {
  if(record?.rules!==RULES || !Array.isArray(record.actions)) throw Error('Journal incompatible.');
  const states=[initialState(record.turnLimit,record.compensation??0,record.options??{})];
  for(const action of record.actions) states.push(play(states.at(-1),action));
  if(record.result!==undefined && JSON.stringify(outcome(states.at(-1)))!==JSON.stringify(record.result)) throw Error('Résultat du journal incohérent.');
  return states;
}
