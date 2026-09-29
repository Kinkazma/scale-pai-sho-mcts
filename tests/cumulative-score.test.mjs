import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {RULES,initialState,play,legalActions,score,cumulativeScore,outcome,pointAt as at,makeRecord,replay} from '../src/engine.mjs';
import {StableRng,search,searchValue} from '../src/search.mjs';
import * as view from '../src/replay-engine.mjs';
import * as old from '../history/v10/engine.mjs';

const totals=s=>cumulativeScore(s).scores.map(x=>x.total);
const boardTotals=s=>score(s).scores.map(x=>x.total);
function fixture(tiles,ply=0){
  const s=initialState(15);s.ply=ply;
  for(const [x,y,n]of tiles){s.board[at(x,y)]=n;s.reserve[n>0?0:1][Math.abs(n)]--;}
  return s;
}

test('a complete personal turn awards both full scores; compensation is paid once',()=>{
  let s=initialState(15,2.5,{compensationSide:1});
  assert.deepEqual(boardTotals(s),[0,0]);assert.deepEqual(totals(s),[0,2.5]);
  s=play(s,[-1,at(-1,0)]);
  assert.deepEqual(boardTotals(s),[8,0]);assert.deepEqual(totals(s),[0,2.5]);
  const before=s;s=play(s,['end-turn']);
  assert.deepEqual(totals(s),[8,2.5]);assert.deepEqual(totals(before),[0,2.5]);
  s=play(s,[-1,at(1,0)]);assert.deepEqual(boardTotals(s),[5,5]);
  s=play(s,['end-turn']);assert.deepEqual(totals(s),[13,7.5]);
  assert.equal(s.scoreLedger.turns,2);
  assert.throws(()=>play(s,['end-turn']),/interdit/);
});

test('automatic completion after placement and three movements counts exactly once',()=>{
  let s=initialState(15);
  for(const a of [[-1,at(0,0)],[at(0,0),at(1,0)],[at(1,0),at(2,0)]]){
    s=play(s,a);assert.deepEqual(totals(s),[0,0]);
  }
  s=play(s,[at(2,0),at(3,0)]);
  assert.equal(s.ply,1);assert.equal(s.scoreLedger.turns,1);assert.deepEqual(totals(s),[8,0]);
  for(let i=0;i<3;i++){score(s);outcome(s);cumulativeScore(s);}
  assert.equal(s.scoreLedger.turns,1);assert.deepEqual(totals(s),[8,0]);
});

test('final-turn automatic completion waits for both owners reactions',()=>{
  // A final movement completes a triangle after the independent placement was used.
  let s=fixture([[-1,0,1],[3,0,2],[0,2,3],[0,1,-1]],28);
  s.placedThisTurn=true;
  s=play(s,[at(-1,0),at(0,0)]);
  assert.ok(s.resolution);assert.equal(s.ply,28);assert.deepEqual(totals(s),[0,0]);
  s=play(s,legalActions(s).find(a=>a[0]==='region'));
  while(s.resolution){assert.equal(s.scoreLedger.turns,0);s=play(s,['decline']);}
  const [a,b]=boardTotals(s);
  assert.equal(s.ply,29);assert.equal(s.scoreLedger.turns,1);
  assert.deepEqual(totals(s),[a,b]);
  assert.equal(score(s).scores[0].prisoners,4);
});

test('free setup and a reaction after its last tile earn nothing',()=>{
  const options={hemispheres:true,jadeHemisphere:'north',compensationSide:1};
  let s=initialState(15,2,options);
  const actions=[[-1,at(-3,3)],[-1,at(0,-1)],[-1,at(-2,3)],[-1,at(2,-1)],[-1,at(-1,3)],[-2,at(0,-3)],[-1,at(0,3)],[-3,at(2,-3)]];
  for(const a of actions){s=play(s,a);assert.deepEqual(totals(s),[0,2]);}
  assert.equal(s.turnKind,'setup');assert.ok(s.resolution);
  s=play(s,['decline']);assert.equal(s.ply,0);assert.equal(s.scoreLedger.turns,0);
  assert.deepEqual(totals(s),[0,2]);
});

test('an early block closes the physical turn after reactions and cannot pay twice',()=>{
  let s=fixture([[-1,0,1],[3,0,2],[0,2,3],[0,1,-1]]);
  s.reserve[1]=[0,0,0,0];
  assert.equal(outcome(s),null);
  s=play(s,[at(-1,0),at(0,0)]);assert.ok(s.resolution);
  assert.equal(outcome(s),null);assert.deepEqual(totals(s),[0,0]);
  s=play(s,legalActions(s).find(a=>a[0]==='region'));
  assert.equal(s.ply,0);assert.equal(outcome(s).reason,'no-legal-action');
  assert.equal(s.scoreLedger.turns,1);
  const expected=totals(s);assert.ok(expected[0]>0);
  for(let i=0;i<5;i++)assert.deepEqual(outcome(s).scores.map(x=>x.total),expected);
  assert.deepEqual(legalActions(s),[]);
});

test('the accumulated leader wins even when the last board favours the other camp',()=>{
  let s=fixture([[-5,0,1],[0,0,-1]],29);
  s.scoreLedger={totals:[300,0],turns:29,lastPly:28};
  s=play(s,[at(0,0),at(1,0)]);s=play(s,['end-turn']);
  const [jade,amber]=boardTotals(s);assert.ok(amber>jade);
  assert.equal(s.scoreLedger.turns,30);assert.equal(outcome(s).winner,0);
  assert.equal(searchValue(s,0,true),1);assert.equal(searchValue(s,1,true),-1);
});

test('bilateral block and loop loss keep priority over any accumulated lead',()=>{
  const s=initialState(15);s.scoreLedger={totals:[500,1],turns:5,lastPly:4};
  const loop={...s,loopLoss:{loser:0,cycle:[]}};
  assert.equal(outcome(loop).winner,1);assert.deepEqual(totals(loop),[500,1]);
  const blocked={...s,board:s.board.map(()=>1),reserve:[[0,0,0,0],[0,0,0,0]]};
  assert.equal(outcome(blocked).winner,null);
});

test('MCTS values distinguish identical boards with different accumulated scores',()=>{
  const s=fixture([[-1,0,1],[1,0,-1]],28);
  const rich={...s,scoreLedger:{totals:[96,0],turns:28,lastPly:27}};
  const poor={...s,scoreLedger:{totals:[0,96],turns:28,lastPly:27}};
  assert.ok(searchValue(rich,0)>0);assert.ok(searchValue(poor,0)<0);
  assert.equal(searchValue(rich,0),-searchValue(rich,1));
  const a=search(rich,32,73),b=search(poor,32,73);
  assert.notDeepEqual(a.rootActions.map(x=>x.value),b.rootActions.map(x=>x.value));
});

test('full legal games agree with an independent per-turn sum, including replay',()=>{
  for(const seed of [17,31,73,101]){
    const options={hemispheres:seed===31,jadeHemisphere:'north',compensationSide:1};
    let s=initialState(15,2.5,options),sum=[0,0],turns=0;
    const actions=[],rng=new StableRng(seed);
    for(let i=0;!outcome(s);i++){
      assert.ok(i<1500,'finite test game');
      const available=legalActions(s),action=available[rng.index(available.length)],before=s;
      s=play(s,action);actions.push(action);
      // Independent event definition, without inspecting the stored ledger.
      const end=outcome(s);
      const closed=!s.loopLoss&&(s.ply>before.ply||(!before.setup&&before.turnKind!=='setup'&&end&&['no-legal-action','both-blocked'].includes(end.reason)&&(s.placedThisTurn||s.movesThisTurn)));
      if(closed){const [a,b]=boardTotals(s);sum[0]+=a;sum[1]+=b;turns++;}
      assert.deepEqual(totals(s),[sum[0],sum[1]+2.5]);assert.equal(s.scoreLedger.turns,turns);
    }
    const record=makeRecord(15,actions,null,2.5,options);
    assert.deepEqual(replay(JSON.parse(JSON.stringify(record))).at(-1),s);
    assert.equal(record.rules,RULES);
    assert.throws(()=>replay({...record,result:{...record.result,scores:[{total:-1},{total:0}]}}),/incohérent/);
  }
});

test('V10 sources remain byte-exact and historical records keep their own scores',()=>{
  const dir=new URL('../history/v10/',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',dir)));
  for(const [file,hash]of Object.entries(manifest))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(file,dir))).digest('hex'),hash);
  const options={hemispheres:true,jadeHemisphere:'south',compensationSide:1};
  const record=old.makeRecord(15,[['finish-setup'],['finish-setup'],[-1,at(0,-1)],['end-turn']],null,2.5,options);
  const oldStates=old.replay(record),states=view.replay(record),last=states.at(-1);
  assert.deepEqual(states,oldStates);assert.deepEqual(view.score(last),old.score(last));
  assert.deepEqual(view.outcome(last),old.outcome(last));
  assert.deepEqual(view.makeRecordForState(states[0],record.actions,null),record);
  assert.throws(()=>replay(record),/incompatible/);assert.throws(()=>search(last,8,1),/incompatible/);
});
