import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,recordRegionalDecision,regionalConfiguration,outcome,legalActions,play,pointAt as at} from '../src/engine.mjs';
import {search} from '../src/search.mjs';
// Isolated repetition-detector contract. The former V7 five-declaration example
// is no longer a legal sequence under active-only new declarations.
test('a repeated regional configuration attributes loss to the first decision of its cycle',()=>{
 const first={...initialState(),resolution:{side:0,order:[0,1],options:[]}};
 const second={...first,resolution:{side:1,order:[0,1],options:[]}};
 const one=recordRegionalDecision(first,second,['decline']);
 assert.equal(one.regionHistory.length,one.regionActions.length+1);
 const lost=recordRegionalDecision(one,first,['decline']);
 assert.equal(lost.loopLoss.loser,0);assert.equal(outcome(lost).winner,1);assert.equal(outcome(lost).reason,'region-loop');assert.deepEqual(legalActions(lost),[]);
 assert.deepEqual(lost.loopLoss.cycle,[{side:0,action:['decline']},{side:1,action:['decline']}]);
});
test('a non-cyclic prefix does not make its author the later cycle initiator',()=>{
 const prefix={...initialState(),resolution:null};
 const first={...prefix,resolution:{side:1,order:[1,0],options:[]}};
 const second={...prefix,resolution:{side:0,order:[1,0],options:[]}};
 let s=recordRegionalDecision(prefix,first,['prefix']);
 s=recordRegionalDecision(s,second,['decline']);
 const lost=recordRegionalDecision(s,first,['decline']);
 assert.equal(lost.loopLoss.loser,1);assert.equal(lost.loopLoss.cycle.length,2);
});
test('forced loop outcome prevails even when its loser leads numerically',()=>{
 const lost={...initialState(30,100,{compensationSide:1}),loopLoss:{loser:1,cycle:[]}};
 assert.equal(outcome(lost).winner,0);assert.ok(outcome(lost).scores[1].total>outcome(lost).scores[0].total);
 assert.equal(search(lost,128,73).action,null);
});
test('a physical move resets regional repetition history',()=>{
 let s=initialState();s.board[at(0,0)]=1;s.reserve[0][1]--;s.regionHistory=[{selected:[[],[]],declined:[[],[]],decision:0}];s.regionActions=[{side:0,action:['decline']}];
 const next=play(s,[at(0,0),at(1,0)]);assert.deepEqual(next.regionHistory,[]);assert.deepEqual(next.regionActions,[]);
});
