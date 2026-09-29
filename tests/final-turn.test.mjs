import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,play,legalActions,maximumActions,pointAt as at,sideToMove,outcome} from '../src/engine.mjs';
test('each final turn allows one movement only, regardless of saved credit or debt',()=>{
 for(const limit of [15,20,30,50,70])for(const credit of [-1,0,1,2]){
  let s=initialState(limit);s.ply=2*(limit-1);s.credits=[credit,credit];
  s.board[at(0,0)]=1;s.board[at(0,4)]=-1;s.reserve[0][1]--;s.reserve[1][1]--;
  assert.equal(maximumActions(s),1);
  s=play(s,[at(0,0),at(1,0)]);assert.ok(!legalActions(s).some(a=>typeof a[0]==='number'&&a[0]>=0));s=play(s,['end-turn']);
  assert.equal(s.ply,2*limit-1);assert.equal(s.movesThisTurn,0);assert.equal(sideToMove(s),1);
  assert.equal(maximumActions(s),1);
  s=play(s,[at(0,4),at(1,4)]);s=play(s,['end-turn']);
  assert.equal(s.ply,2*limit);assert.equal(outcome(s).reason,'turn-limit');assert.deepEqual(legalActions(s),[]);
 }
});
test('penultimate turn still permits three; last pose leaves the independent movement available',()=>{
 let s=initialState(30);s.ply=56;s.credits[0]=2;assert.equal(maximumActions(s),3);
 s={...s,ply:58};s=play(s,[-1,at(0,0)]);assert.equal(s.ply,58);assert.equal(s.credits[0],2);
});
test('last movement waits for region decisions before ending the turn',()=>{
 let s=initialState(30);s.ply=58;s.credits[0]=2;
 for(const [x,y,v]of [[-1,0,1],[3,0,2],[0,2,3]]){s.board[at(x,y)]=v;s.reserve[0][v]--;}
 s=play(s,[at(-1,0),at(0,0)]);
 assert.equal(s.ply,58);assert.equal(s.movesThisTurn,1);assert.equal(s.resolution.side,0);
 assert.ok(legalActions(s).every(a=>typeof a[0]==='string'));
 s=play(s,legalActions(s).find(a=>a[0]==='region'));assert.equal(s.ply,58);s=play(s,['end-turn']);
 assert.equal(s.ply,59);assert.equal(sideToMove(s),1);
});
