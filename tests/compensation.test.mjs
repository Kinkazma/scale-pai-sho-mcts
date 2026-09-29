import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,score,cumulativeScore,outcome,makeRecord,replay,play,pointAt} from '../src/engine.mjs';
import {search} from '../src/search.mjs';
test('fixed second-player compensation survives actions, records and affects final outcome',()=>{
 let state=initialState(30,2.5,{compensationSide:1});
 assert.equal(cumulativeScore(state).scores[1].total,2.5);
 state=play(state,[-1,pointAt(0,0)]);assert.equal(state.compensation,2.5);
 const end={...initialState(30,2.5,{compensationSide:1}),ply:60};assert.equal(outcome(end).winner,1);
 const record=makeRecord(30,[[-1,pointAt(0,0)]],null,2.5,{compensationSide:1});
 assert.equal(replay(record).at(-1).compensation,2.5);
 assert.equal(cumulativeScore(replay(record).at(-1)).scores[1].compensation,2.5);
 for(const value of [-1,Infinity,NaN])assert.throws(()=>initialState(30,value));
 assert.throws(()=>replay({...record,compensation:-1}));
});
test('MCTS leaf values include compensation during search',()=>{
 const baseline=search(initialState(30,0),8,42),adjusted=search(initialState(30,20),8,42);
 assert.notDeepEqual(baseline.rootActions.map(a=>a.value),adjusted.rootActions.map(a=>a.value));
 assert.equal(adjusted.simulations,8);
});
