/** Pai Sho Regions V1. Independent rules; shared with browser, workers and Node. */
export const RULES = 'paisho-regions-v9-independent-turn-quotas';
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
const distances = POINTS.map(a => POINTS.map(b => Math.abs(a.x-b.x)+Math.abs(a.y-b.y)));
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
  return {rules:RULES,hemispheres,jadeHemisphere,compensationSide,setup:hemispheres?{side:0,placed:[0,0],finished:[false,false]}:null,board:Array(POINTS.length).fill(0), reserve:[[...STOCK],[...STOCK]], ply:0, placedThisTurn:false, movesThisTurn:0, turnKind:null, credits:[0,0], turnLimit, compensation, regionHistory:[], regionActions:[], loopLoss:null, selected:[[],[]], declined:[[],[]], resolution:null};
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
  credits[side]=Math.min(2,credits[side]+2-state.movesThisTurn);
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
/** Active-only inhibition. Unresolved mutual cycles are neutralized together,
 * then downstream regions are resolved normally. No iteration oscillation. */
export function resolveRegions(regions) {
  const flat=regions.flat(),incoming=flat.map(r=>flat.flatMap((other,j)=>other.side!==r.side&&r.vertices.some(p=>other.inside.includes(p))?[j]:[]));
  const status=flat.map(()=>0),cycle=new Set();
  while(status.includes(0)){
    let progress=false;
    for(let i=0;i<flat.length;i++)if(status[i]===0){
      if(incoming[i].some(j=>status[j]===1)){status[i]=-1;progress=true;}
      else if(incoming[i].every(j=>status[j]===-1)){status[i]=1;progress=true;}
    }
    if(progress)continue;
    const unknown=status.flatMap((s,i)=>s===0?[i]:[]);
    const reach=i=>{const seen=new Set([i]),todo=[i];while(todo.length){const k=todo.pop();for(const j of incoming[k])if(status[j]===0&&!seen.has(j)){seen.add(j);todo.push(j);}}return seen;};
    const reaches=new Map(unknown.map(i=>[i,reach(i)]));
    const marked=new Set();
    for(const i of unknown){
      if(marked.has(i))continue;
      const component=unknown.filter(j=>reaches.get(i).has(j)&&reaches.get(j).has(i));
      if(component.every(j=>incoming[j].every(k=>status[k]!==0||component.includes(k))))component.forEach(j=>marked.add(j));
    }
    if(!marked.size)throw Error('Unresolved region graph');
    for(const i of marked){status[i]=-1;cycle.add(i);}
  }
  return regions.map(rs=>rs.map(r=>{const i=flat.indexOf(r);return {...r,status:status[i]===1?'active':'suspended',cyclic:cycle.has(i)};}));
}
export function analyze(state) {
  if(cache.has(state))return cache.get(state);
  const all=candidates(state), selected=state.selected??[[],[]];
  const regions=resolveRegions(all.map((rs,side)=>rs.filter(r=>selected[side].some(v=>regionKey(v)===r.key))));
  const territory=[new Set(),new Set()];
  for(let side=0;side<2;side++)for(const r of regions[side]){
    if(r.status==='active')r.inside.forEach(p=>territory[side].add(p));
  }
  const frozen=new Set();
  state.board.forEach((v,p)=>{if(v&&territory[1-owner(v)].has(p))frozen.add(p);});
  const result={regions,territory,frozen,candidates:all};cache.set(state,result);return result;
}
function declare(state,side,vertices) {
  const selected=state.selected.map(rs=>rs.map(v=>v.slice()));
  // A replacement removes the former declaration as well as its effects.
  const removed=selected[side].filter(v=>v.some(p=>vertices.includes(p)));
  selected[side]=selected[side].filter(v=>!v.some(p=>vertices.includes(p)));
  selected[side].push(vertices);
  const declined=state.declined.map((rs,i)=>i===side?[...rs,...removed]:rs);
  return {...state,selected,declined};
}
function choicesFor(state,side) {
  const before=analyze(state),activeTiles=new Set(before.regions[side].filter(r=>r.status==='active').flatMap(r=>r.vertices));
  if(before.regions[side].filter(r=>r.status==='active').length>=MAX_ACTIVE_REGIONS)return [];
  const keys=new Set([...state.selected[side],...(state.declined?.[side]??[])].map(regionKey));
  return before.candidates[side].filter(r=>{
    if(keys.has(r.key)||r.vertices.some(p=>activeTiles.has(p)))return false;
    // A newly chosen declaration must have an active effect after all suspensions
    // settle. Existing declarations may still become suspended and reactivate.
    return analyze(declare(state,side,r.vertices)).regions[side].some(next=>next.key===r.key&&next.status==='active');
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
  return {selected:canonical(state.selected),declined:canonical(state.declined),decision:state.resolution?.side??null};
}
export function recordRegionalDecision(before,after,action){
  const history=before.regionHistory?.length?before.regionHistory:[regionalConfiguration(before)];
  const events=[...(before.regionActions??[]),{side:sideToMove(before),action}];
  const configuration=regionalConfiguration(after),key=JSON.stringify(configuration);
  const repeated=history.findIndex(previous=>JSON.stringify(previous)===key);
  const result={...after,regionHistory:[...history,configuration],regionActions:events};
  if(repeated>=0)return {...result,resolution:null,loopLoss:{loser:sideToMove(before),cycle:events.slice(repeated)}};
  return result;
}
function settle(state,order) {
  for(const side of order){
    const options=choicesFor(state,side);
    if(options.length)return {...state,resolution:{side,order,options:options.map(r=>r.vertices)}};
  }
  const resolved={...state,resolution:null};
  if(resolved.turnKind==='setup')return {...resolved,turnKind:null};
  return resolved.placedThisTurn&&resolved.movesThisTurn>=maximumActions(resolved)?completeTurn(resolved):resolved;
}

export function legalActions(state) {
  if(state.loopLoss)return [];
  if(state.resolution)return [...state.resolution.options.map(v=>['region',...v]),['decline']];
  if(state.ply>=state.turnLimit*2) return [];
  const side=sideToMove(state), {territory,frozen}=analyze(state), blocked=territory[1-side], result=[];
  for(let p=0;p<POINTS.length;p++) {
    const value=state.board[p];
    if(!value) {
      if(!state.placedThisTurn&&!blocked.has(p)&&canPlaceAt(state,side,p)) for(let tile=1;tile<=3;tile++) if(state.reserve[side][tile]>0) result.push([-tile,p]);
    } else if(!state.setup && state.movesThisTurn<maximumActions(state) && owner(value)===side && !frozen.has(p)) {
      for(const path of paths[p][Math.abs(value)]) {
        if(path.every(q=>state.board[q]===0 && !blocked.has(q))) result.push([p,path.at(-1)]);
      }
    }
  }
  if(state.setup)result.push(['finish-setup']);
  else if(state.movesThisTurn>0||state.placedThisTurn)result.push(['end-turn']);
  return result;
}

/** Internal fast transition, only for an action returned by legalActions. */
export function playLegal(state, action) {
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
  const settled=settle({...refreshDeclines(state,next),regionHistory:[],regionActions:[]},[side,1-side]);
  return {...settled,regionHistory:settled.resolution?[regionalConfiguration(settled)]:[]};
}
export function play(state,action) {
  if(!Array.isArray(action)||!legalActions(state).some(a=>a.length===action.length&&a.every((v,i)=>v===action[i])))throw Error('Coup interdit.');
  return playLegal(state,action);
}

export function score(state) {
  const {territory,frozen,regions}=analyze(state);
  const regionVertices=regions.map(rs=>new Set(rs.flatMap(r=>r.vertices)));
  const occupied=[[],[]];
  state.board.forEach((v,p)=>{if(v) occupied[owner(v)].push(p);});
  const influence=Array(POINTS.length).fill(-1);
  const scores=[0,1].map(()=>({influence:0,regions:0,prisoners:0,frozenCount:0,vertexPrisoners:0,total:0}));
  for(let p=0;p<POINTS.length;p++) {
    if(!state.board[p]) {
      const d=occupied.map(ps=>ps.reduce((m,q)=>Math.min(m,distances[p][q]),Infinity));
      if(d[0]!==d[1]) { const side=d[0]<d[1]?0:1; influence[p]=side; scores[side].influence++; }
    }
    // Regions affect movement, suspension and prisoners; their area scores nothing.
    if(frozen.has(p)) {
      const prisonerSide=owner(state.board[p]),beneficiary=scores[1-prisonerSide];
      const isVertex=regionVertices[prisonerSide].has(p);
      beneficiary.frozenCount++;beneficiary.prisoners+=isVertex?2:1;
      if(isVertex)beneficiary.vertexPrisoners++;
    }
  }
  if(state.compensation){scores[state.compensationSide??0].compensation=state.compensation;}
  for(const s of scores) s.total=s.influence+s.regions+s.prisoners+(s.compensation??0);
  return {scores,influence};
}
export function outcome(state, actions=legalActions(state)) {
  if(state.loopLoss)return {reason:'region-loop',winner:1-state.loopLoss.loser,loser:state.loopLoss.loser,cycle:state.loopLoss.cycle,scores:score(state).scores};
  if(state.resolution)return null;
  const reason=state.ply>=state.turnLimit*2?'turn-limit':actions.length===0?'no-legal-action':null;
  if(!reason) return null;
  const {scores}=score(state),diff=scores[0].total-scores[1].total;
  return {reason,winner:diff===0?null:diff>0?0:1,scores};
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
