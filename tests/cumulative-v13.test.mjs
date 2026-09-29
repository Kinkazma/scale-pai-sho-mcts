import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import * as engine from '../src/engine.mjs';import * as old from '../history/v12/engine.mjs';import * as view from '../src/replay-engine.mjs';
import {searchValue} from '../src/search.mjs';import {repetitionKey} from '../src/repetition-guard.mjs';
const record=JSON.parse(fs.readFileSync(new URL('./fixtures/v12-score-30-226.json',import.meta.url)));
test('the actual reported game awards both scores at all 60 settlements and preserves the advantage',()=>{
 const oldStates=old.replay(record);let state=engine.initialState(record.turnLimit,record.compensation,record.options),sum=[0,0],count=0;
 for(let i=0;i<record.actions.length;i++){
  const before=state;state=engine.play(state,record.actions[i]);const reference=oldStates[i+1];
  assert.deepEqual(engine.score(state),old.score(reference));assert.deepEqual(engine.legalActions(state),old.legalActions(reference));
  if(reference.scoreLedger.turns>oldStates[i].scoreLedger.turns){
   old.score(reference).scores.forEach((s,side)=>sum[side]+=s.total);count++;
   assert.equal(state.scoreLedger.turns-before.scoreLedger.turns,1);
  }
  assert.deepEqual(state.scoreLedger.totals,sum);assert.deepEqual(state.scoreLedger.advantageTotals,reference.scoreLedger.totals);
  assert.equal(engine.cumulativeDifference(state),sum[0]-sum[1]);
 }
 assert.equal(count,60);assert.deepEqual(old.cumulativeScore(oldStates.at(-1)).scores.map(x=>x.total),[1013,40]);
 assert.deepEqual(sum,[2415,1442]);assert.equal(engine.outcome(state).winner,old.outcome(oldStates.at(-1)).winner);
 const migrated=engine.makeRecord(record.turnLimit,record.actions,record.agents,record.compensation,record.options);
 assert.deepEqual(engine.replay(migrated).at(-1),state);
});
test('V12 replay is preserved with original totals and strict versioning',()=>{
 const dir=new URL('../history/v12/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',dir)));
 for(const [name,sha]of Object.entries(manifest))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(name,dir))).digest('hex'),sha);
 const states=view.replay(record);assert.deepEqual(states,old.replay(record));
 assert.deepEqual(view.cumulativeScore(states.at(-1)).scores.map(x=>x.total),[1013,40]);
 assert.throws(()=>engine.replay(record),/incompatible/);
});
test('equal shared awards keep stagnation identity while real advantage still changes it',()=>{
 const a=engine.initialState(),b={...a,scoreLedger:{...a.scoreLedger,totals:[40,40]}};
 assert.equal(repetitionKey(a),repetitionKey(b));
 assert.notEqual(repetitionKey(a),repetitionKey({...b,scoreLedger:{...b.scoreLedger,totals:[40,42],advantageTotals:[0,2]}}));
});
test('fractional compensation keeps the historical floating-point order used by MCTS',()=>{
 for(const compensation of [.1,2.5,1/3])for(const compensationSide of [0,1]){
  const s=engine.initialState(15,compensation,{compensationSide});s.scoreLedger={totals:[2415,1442],advantageTotals:[1013,40],turns:30,lastPly:29};
  for(const side of [0,1]){
   const oldTotals=[1013,40].map((n,i)=>n+(i===compensationSide?compensation:0)),difference=oldTotals[side]-oldTotals[1-side];
   assert.equal(engine.cumulativeDifference(s,side),difference);assert.equal(searchValue(s,side),Math.tanh(difference/(24*30)));
  }
 }
});
