import {initialState,legalActions,playLegal,outcome,sideToMove,isFinalTurn} from './engine.mjs';

export const REPETITION_POLICY='avoid-stagnation-v1';
const key=a=>JSON.stringify(a);
/** Behavioral projection only, NEVER a key for values, transitions or proofs.
 * Elapsed turns are deliberately ignored, but earned points and changing rights
 * break the cycle. Returning to a profitable board remains allowed. */
export function repetitionKey(s){
 return JSON.stringify([s.rules,s.board,s.reserve,sideToMove(s),s.setup,s.credits,
  s.placedThisTurn,s.movesThisTurn,s.turnKind,s.hemispheres,s.jadeHemisphere,
  s.compensation,s.compensationSide,s.turnLimit,isFinalTurn(s),s.scoreLedger.advantageTotals??s.scoreLedger.totals,
  s.selected,s.declined,s.regionActivity,s.resolution,s.regionHistory,s.regionActions,s.loopLoss]);
}
export function repeatedSuffix(history,next){
 const positions=[...history,next].slice(-129);
 for(let period=2;period<=32;period++){
  const span=period*4;if(span<24||positions.length<=span)continue;
  const start=positions.length-span-1;
  let equal=true;for(let i=start+period;i<positions.length;i++)if(positions[i]!==positions[i-period]){equal=false;break;}
  if(equal)return {period,cycles:4,decisions:span};
 }
 return null;
}
function ranked(candidates,side){
 let eligible=candidates;const wins=eligible.filter(c=>c.proof===side);
 if(wins.length)eligible=wins;
 else{
  const safe=eligible.filter(c=>c.proof!==1-side);if(safe.length)eligible=safe;
  if(eligible.some(c=>c.proof==='draw'))eligible=eligible.filter(c=>c.proof==='draw'||(c.proof==='unknown'&&c.visits>0&&c.value>0));
 }
 return eligible.reduce((a,b)=>!a||b.visits>a.visits||(b.visits===a.visits&&b.value>a.value)?b:a,null);
}
/** Root recommendation filter: the full legal MCTS tree and its proofs stay intact. */
export function avoidRepeatedChoice(state,result,history){
 const meta={policy:REPETITION_POLICY,blockedCandidates:0,avoided:false,forced:false};
 if(!result.action||history.length<24)return {...result,repetitionGuard:meta};
 const side=sideToMove(state),checked=new Map(),terminalLosses=new Set();
 const forbidden=action=>{
  const k=key(action);if(checked.has(k))return checked.get(k);
  const row=result.rootActions.find(c=>key(c.action)===k);
  // A rule-proven win is never sacrificed to this behavioral preference.
  const next=playLegal(state,action),terminal=outcome(next);
  if(terminal?.winner===1-side)terminalLosses.add(k);
  const cycle=row?.proof===side||terminal?null:repeatedSuffix(history,repetitionKey(next));
  checked.set(k,cycle);if(cycle)meta.blockedCandidates++;return cycle;
 };
 const cycle=forbidden(result.action);if(!cycle)return {...result,repetitionGuard:meta};
 const allowed=result.rootActions.filter(c=>c.proof!==1-side&&!forbidden(c.action)&&!terminalLosses.has(key(c.action)));
 let action=ranked(allowed,side)?.action;
 if(!action){
  const losses=new Set(result.rootActions.filter(c=>c.proof===1-side).map(c=>key(c.action)));
  action=legalActions(state).find(a=>!losses.has(key(a))&&!forbidden(a)&&!terminalLosses.has(key(a)));
 }
 if(!action){meta.forced=true;return {...result,repetitionGuard:{...meta,...cycle}};}
 return {...result,action,repetitionGuard:{...meta,...cycle,avoided:true}};
}
export class RepetitionGuardSession{
 constructor(inner){this.inner=inner;this.state=null;this.history=[];this.pending=[];this.advanceMilliseconds=0;}
 get profile(){return this.inner.profile;}
 get root(){return this.inner.root;}
 drainOverheadMilliseconds(){const ms=this.advanceMilliseconds;this.advanceMilliseconds=0;return ms;}
 clear(){this.inner.clear?.();this.state=null;this.history=[];this.pending=[];this.advanceMilliseconds=0;}
 remember(state){this.state=state;this.history.push(repetitionKey(state));if(this.history.length>129)this.history.shift();}
 advance(action,nextState){
  const reused=this.inner.advance(action);
  const start=performance.now();
  if(nextState){this.pending=[];this.remember(nextState);}
  else this.pending.push(action);
  this.advanceMilliseconds+=performance.now()-start;
  return reused;
 }
 search(state,budget,seed){
  const start=performance.now();
  if(this.pending.length){
   let previous=this.state??initialState(state.turnLimit,state.compensation,{hemispheres:state.hemispheres,jadeHemisphere:state.jadeHemisphere,compensationSide:state.compensationSide});
   if(!this.state)this.remember(previous);
   for(const action of this.pending){previous=playLegal(previous,action);this.remember(previous);}
   this.pending=[];
  }
  if(!this.state||JSON.stringify(this.state)!==JSON.stringify(state)){this.history=[];this.remember(state);}
  const searchStart=performance.now(),searched=this.inner.search(state,budget,seed),searchElapsed=performance.now()-searchStart;
  const result=avoidRepeatedChoice(state,searched,this.history);
  const milliseconds=performance.now()-start+this.drainOverheadMilliseconds();
  return {...result,milliseconds,repetitionGuard:{...result.repetitionGuard,milliseconds:milliseconds-searchElapsed}};
 }
}
