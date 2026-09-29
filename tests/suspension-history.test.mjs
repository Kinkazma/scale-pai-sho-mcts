import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,play,analyze,pointAt as at,outcome} from '../src/engine.mjs';
import {resolveActivity} from '../src/region-resolution.mjs';

test('a legal mutual dependency keeps its stable activity after an outside blocker disappears',()=>{
  const actions=[[-1,56],['end-turn'],[-1,1],['end-turn'],[-2,59],['end-turn'],[-2,2],['end-turn'],[-3,79],['region',56,59,79],['end-turn'],[-3,80],['region',1,2,80],['end-turn'],[-1,51],['end-turn'],[-1,0],['end-turn'],[51,63],['end-turn'],[-2,58],['end-turn'],[63,51],['end-turn'],[-3,72],['region',0,58,72],['end-turn'],[51,63],['end-turn'],[1,10],['decline']];
  let s=initialState();for(const a of actions)s=play(s,a);
  const regions=analyze(s).regions;
  assert.equal(regions[0][0].status,'suspended');
  assert.equal(regions[1].length,1);assert.equal(regions[1][0].status,'active');
  assert.equal(s.board[at(-3,-5)],0);assert.equal(s.loopLoss,null);assert.equal(outcome(s),null);
});

test('a temporal suspension oscillation is distinguishable from a stable cyclic graph',()=>{
  const regions=[[{side:0,key:'A',vertices:[0],inside:[1]}],[{side:1,key:'B',vertices:[1],inside:[0]}]];
  const stable=resolveActivity(regions,{'0:A':false,'1:B':true});
  assert.equal(stable.cycle,undefined);assert.equal(stable.regions[1][0].status,'active');
  const oscillating=resolveActivity(regions,{'0:A':true,'1:B':true});
  assert.equal(oscillating.cycle.length,3);
  assert.throws(()=>resolveActivity(regions),/Historique/);
});
