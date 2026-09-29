import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, pointAt as at, play, legalActions, analyze} from '../src/engine.mjs';

const vertices = points => points.map(([x,y]) => at(x,y)).sort((a,b) => a-b);
const has = (state, action) => legalActions(state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action));

test('a never-active triangle is not offered as a suspended declaration', () => {
  let state = initialState();
  const tiles = [[0,0,1],[-3,0,2],[-3,-1,2],[-3,2,3],[-1,-1,-1],[2,-1,-2],[-1,1,-3]];
  for (const [x,y,value] of tiles) { state.board[at(x,y)] = value;state.reserve[value>0?0:1][Math.abs(value)]--; }
  state.selected[1] = [vertices([[-1,-1],[2,-1],[-1,1]])];
  state = play(state, [-1,at(5,0)]);
  for(const v of [[[0,0],[-3,0],[-3,2]],[[0,0],[-3,-1],[-3,2]]]){
   assert.ok(!has(state,['region',...vertices(v)]));assert.throws(()=>play(state,['region',...vertices(v)]));
  }
  assert.equal(analyze(state).regions[0].length,0);
});
test('a retained suspended triangle may be replaced by a new active one',()=>{
 const s=initialState(),A=[[0,0],[3,0],[0,2]],B=[[-1,-1],[2,-1],[-1,1]];
 for(const [side,v]of [[0,A],[1,B]])v.forEach(([x,y],i)=>{s.board[at(x,y)]=(side? -1:1)*(i+1);s.reserve[side][i+1]--;});
 s.selected=[[vertices(A)],[vertices(B)]];
 assert.equal(analyze(s).regions[0][0].status,'suspended');
 const placed=play(s,[-1,at(4,-4)]),replacement=['region',...vertices([[4,-4],[3,0],[0,2]])];
 assert.ok(has(placed,replacement));const next=play(placed,replacement);
 assert.ok(!next.selected[0].some(v=>v.join(',')===vertices(A).join(',')));
 assert.equal(analyze(next).regions[0].find(r=>r.key===replacement.slice(1).join(',')).status,'active');
});
