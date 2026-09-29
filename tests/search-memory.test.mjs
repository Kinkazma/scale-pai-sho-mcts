import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,play,legalActions,pointAt as at,sideToMove,outcome} from '../src/engine.mjs';
import {search,createSearchSession,searchValue,StableRng} from '../src/search.mjs';
import {RetainedSearch,RETAINED_SEARCH,refreshProof,recommend} from '../src/search-memory.mjs';
import {search as baseline} from '../fixtures/baseline-v12/src/search.mjs';
import {SearchController} from '../src/search-controller.mjs';

const modern={id:'test-retained',searchVersion:RETAINED_SEARCH,candidates:8,rolloutDepth:0};
const reads=r=>({action:r.action,rootActions:r.rootActions,simulations:r.simulations,proof:r.proof});

test('unchanged profiles reproduce the frozen V12 baseline exactly',()=>{
  let state=initialState(15);
  for(const a of [[-1,at(0,0)],['end-turn'],[-3,at(2,2)],['end-turn']])state=play(state,a);
  for(const s of [initialState(15),state])for(const budget of [8,32,128])for(const profile of [{id:'a',candidates:8},{id:'b',candidates:8,rolloutDepth:0}]){
    const a=search(s,budget,41,profile),b=baseline({...s,rules:'paisho-regions-v12-local-majority',scoreLedger:{totals:s.scoreLedger.advantageTotals,turns:s.scoreLedger.turns,lastPly:s.scoreLedger.lastPly}},budget,41,profile);
    assert.deepEqual(a.action,b.action);assert.deepEqual(a.rootActions,b.rootActions);assert.equal(a.simulations,b.simulations);
  }
});

test('candidate caching preserves decisions and values bit for bit while avoiding repeated applications',()=>{
  const state=initialState(15);
  const a=search(state,128,19,{...modern,cacheCandidates:true,reuseTree:false,solver:false});
  const b=search(state,128,19,{...modern,cacheCandidates:false,reuseTree:false,solver:false});
  assert.deepEqual(reads(a),reads(b));assert.ok(a.appliedActions<b.appliedActions);assert.ok(a.evaluations<b.evaluations);
});

test('retained visits survive a same-player move and every search pays its new budget',()=>{
  const session=createSearchSession({...modern,solver:false}),state=initialState(15);
  const first=session.search(state,128,31),next=play(state,first.action);
  assert.equal(sideToMove(state),sideToMove(next));assert.ok(session.advance(first.action));
  const r=session.search(next,32,32);
  assert.ok(r.inheritedVisits>0);assert.equal(r.simulations,32);assert.equal(r.rootVisits,r.inheritedVisits+32);
  assert.equal(r.rootActions.reduce((n,c)=>n+c.visits,0),r.rootVisits-1);
  assert.ok(legalActions(next).some(a=>JSON.stringify(a)===JSON.stringify(r.action)));
});

test('full-state mismatch resets inheritance for score, quota, time and regional history',()=>{
  const state=initialState(15);
  for(const altered of [
    {...state,scoreLedger:{...state.scoreLedger,totals:[1,0]}},
    {...state,credits:[1,0]},
    {...state,turnLimit:20},
    {...state,regionHistory:[{selected:[[],[]],declined:[[],[]],activity:[],decision:0}]},
  ]){
    const session=createSearchSession(modern);session.search(state,32,1);
    assert.equal(session.search(altered,8,2).inheritedVisits,0);
  }
});

test('proofs distinguish unknown/draw, require every reply for a loss, and use the real chooser',()=>{
  const state={...initialState(),ply:0,resolution:{side:1}};
  function parent(proofs,actions=3){return {state,actions:Array(actions).fill(['x']),proof:undefined,prepared:new Map(proofs.map((proof,i)=>[i,{proof}]))};}
  for(const n of [parent([0]),parent([0,null]),parent([0,null,undefined])]){refreshProof(n);assert.equal(n.proof,undefined);}
  const win=parent([1]);refreshProof(win);assert.equal(win.proof,1);
  const draw=parent([0,null,0]);refreshProof(draw);assert.equal(draw.proof,null);
  const loss=parent([0,0,0]);refreshProof(loss);assert.equal(loss.proof,0);
});

test('a proof outranks retained visits; a known draw protects against negative unknowns',()=>{
  const child=(proof,visits,value)=>({state:initialState(),proof,visits,sum:value*visits,prepared:new Map()});
  const unknown=child(undefined,1000,.9),win=child(0,1,1);
  assert.equal(recommend([unknown,win],0,true),win);
  const losing=child(undefined,1000,-.9),draw=child(null,1,0);
  assert.equal(recommend([losing,draw],0,true),draw);
  assert.equal(recommend([unknown,draw],0,true),unknown);
});

test('real terminal win discovered at a turn end remains solved after advance',()=>{
  const s=initialState(15);s.ply=29;s.board[at(0,0)]=-1;s.reserve[1][1]--;s.placedThisTurn=true;
  s.scoreLedger={totals:[0,5000],turns:29,lastPly:28};
  const session=createSearchSession({...modern,candidates:16}),r=session.search(s,128,13);
  assert.equal(r.proof,1);assert.equal(outcome(play(s,r.action)).winner,1);assert.ok(r.simulations<128);
  session.advance(r.action);const terminal=session.search(play(s,r.action),8,14);
  assert.equal(terminal.action,null);assert.equal(terminal.simulations,0);assert.equal(terminal.proof,1);
});

test('two seats can advance retained search with the same fixed value perspective',()=>{
  const s=initialState(15),session=new RetainedSearch({...modern,solver:false},{Rng:StableRng,evaluate:searchValue});
  session.search(s,128,7);
  const a=legalActions(s)[0];session.advance(a);const next=play(s,a);
  session.search(next,128,8);assert.ok(session.advance(['end-turn']));
  const switched=play(next,['end-turn']);assert.equal(sideToMove(switched),1);
  const result=session.search(switched,32,9);assert.ok(result.inheritedVisits>0);
  assert.ok(result.rootActions.every(c=>Number.isFinite(c.value)&&Math.abs(c.value)<=1));
});
test('browser controller forwards actual history and resets after replay rewind',()=>{
  const controller=new SearchController(()=>({...modern,solver:false})),state=initialState(15);
  const first=controller.decide({state,budget:128,seed:31,history:[]}),next=play(state,first.action);
  const second=controller.decide({state:next,budget:128,seed:32,history:[first.action]});
  assert.ok(second.inheritedVisits>0);
  const rewind=controller.decide({state,budget:128,seed:31,history:[]});
  assert.equal(rewind.inheritedVisits,0);assert.deepEqual(reads(rewind),reads(first));
});
