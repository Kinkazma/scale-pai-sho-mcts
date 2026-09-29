import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,pointAt as at,play,legalActions,analyze,outcome,physicalMobility,score,cumulativeScore} from '../src/engine.mjs';

test('a legal opening allows a three-step jump over empty enemy region points',()=>{
  let s=initialState(15);
  const vertices=[at(0,0),at(3,0),at(0,2)].sort((a,b)=>a-b);
  for(const action of [[-1,at(0,0)],['end-turn'],[-3,at(-1,1)],['end-turn'],[-2,at(3,0)],['end-turn'],[-1,at(-5,0)],['end-turn'],[-3,at(0,2)],['region',...vertices],['end-turn']])s=play(s,action);
  assert.ok(analyze(s).territory[0].has(at(0,1)));
  assert.ok(analyze(s).territory[0].has(at(1,1)));
  assert.equal(analyze(s).territory[0].has(at(2,1)),false);
  const moved=play(s,[at(-1,1),at(2,1)]);
  assert.equal(moved.board[at(2,1)],-3);
  const obstructed={...s,board:s.board.map((v,p)=>p===at(0,1)?1:v)};
  assert.throws(()=>play(obstructed,[at(-1,1),at(2,1)]));
});

test('actual immobility ignores used quotas, the end-turn button and the other player turn',()=>{
  const s=initialState();
  s.board[at(0,0)]=1;s.reserve[0][1]--;s.placedThisTurn=true;s.movesThisTurn=3;
  assert.deepEqual(physicalMobility(s),[true,true]);
  assert.equal(outcome(s),null);
  assert.deepEqual(legalActions(s),[['end-turn']]);
  const blocked={...s,reserve:[s.reserve[0],[0,0,0,0]]};
  assert.deepEqual(physicalMobility(blocked),[true,false]);
  assert.equal(outcome(blocked).reason,'no-legal-action');
  assert.equal(outcome(blocked).winner,0);
  assert.deepEqual(legalActions(blocked),[]);
});

test('bilateral immobility is a draw even with unequal numerical scores',()=>{
  // Constructed terminal contract: full board, no stock, hence no physical action.
  const s=initialState();s.board.fill(1);s.reserve=[[0,0,0,0],[0,0,0,0]];
  s.compensation=5;
  assert.notEqual(cumulativeScore(s).scores[0].total,cumulativeScore(s).scores[1].total);
  assert.deepEqual(physicalMobility(s),[false,false]);
  assert.equal(outcome(s).reason,'both-blocked');
  assert.equal(outcome(s).winner,null);
});
