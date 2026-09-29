import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,score,legalActions,play,analyze} from '../src/engine.mjs';
import {StableRng} from '../src/search.mjs';

function exchange(state){return {...state,scoreLedger:{...state.scoreLedger,totals:[...state.scoreLedger.totals].reverse(),advantageTotals:[...state.scoreLedger.advantageTotals].reverse(),lastPly:state.scoreLedger.lastPly+1},regionActivity:Object.fromEntries(Object.entries(state.regionActivity).map(([key,value])=>[`${1-Number(key[0])}${key.slice(1)}`,value])),regionHistory:state.regionHistory.map(h=>({...h,activity:h.activity.map(([key,value])=>[`${1-Number(key[0])}${key.slice(1)}`,value]).sort(([a],[b])=>a.localeCompare(b)),selected:[h.selected[1],h.selected[0]],declined:[h.declined[1],h.declined[0]],decision:h.decision===null?null:1-h.decision})),regionActions:state.regionActions.map(e=>({...e,side:1-e.side})),board:state.board.map(v=>-v||0),reserve:[state.reserve[1],state.reserve[0]],credits:[state.credits[1],state.credits[0]],selected:[state.selected[1],state.selected[0]],declined:[state.declined[1],state.declined[0]],ply:state.ply+1,resolution:state.resolution?{...state.resolution,side:1-state.resolution.side,order:state.resolution.order.map(s=>1-s)}:null};}
test('color/actor exchange preserves physical rules and credits away from the terminal horizon',()=>{
 const rng=new StableRng(42),states=[initialState(70)];
 for(let i=0;i<45;i++){const s=states.at(-1),actions=legalActions(s);states.push(play(s,actions[rng.index(actions.length)]));}
 for(const limit of [30,50,70]){
  for(const index of [12,24,40]){
   const state={...states[index],turnLimit:limit},swapped=exchange(state);
   assert.deepEqual(score(state).scores,[...score(swapped).scores].reverse());
   assert.deepEqual(legalActions(state),legalActions(swapped));
   assert.deepEqual([...analyze(state).frozen],[...analyze(swapped).frozen]);
   for(const action of legalActions(state).slice(0,3))assert.deepEqual(exchange(play(state,action)),play(swapped,action));
   // Flipping the actor shifts ply by one: the remaining scoring horizon now
   // differs, so exact search values are no longer a symmetry of this mapping.
  }
 }
});
