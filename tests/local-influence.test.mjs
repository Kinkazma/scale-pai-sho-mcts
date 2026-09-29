import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {POINTS,initialState,pointAt as at,score,cumulativeScore,analyze,play,legalActions,outcome} from '../src/engine.mjs';
import {search,searchValue,StableRng} from '../src/search.mjs';
import * as view from '../src/replay-engine.mjs';
import * as v11 from '../history/v11/engine.mjs';

function fixture(tiles){
  const state=initialState(15);
  for(const [x,y,value]of tiles){state.board[at(x,y)]=value;state.reserve[value>0?0:1][Math.abs(value)]--;}
  return state;
}

// Independent all-pairs geometric census; no production neighbourhood table.
function oracle(state){
  const counts=POINTS.map((p,i)=>{
    const n=[0,0];
    if(!state.board[i])state.board.forEach((v,j)=>{
      const q=POINTS[j];
      if(v&&Math.max(Math.abs(q.x-p.x),Math.abs(q.y-p.y))===1)n[v>0?0:1]++;
    });
    return n;
  });
  const owners=counts.map(([a,b])=>a===b?-1:a>b?0:1);
  return {counts,owners,totals:[0,1].map(side=>owners.filter(x=>x===side).length)};
}

test('every tile has eight local neighbours, diagonals included; the edge clips that square',()=>{
  for(const tile of [1,2,3,-1,-2,-3]){
    const result=score(fixture([[0,0,tile]])),side=tile>0?0:1;
    assert.equal(result.scores[side].influence,8);
    assert.equal(result.influence[at(1,1)],side);
    assert.equal(result.influence[at(2,0)],-1);
    assert.equal(result.influence[at(0,0)],-1);
  }
  const edge=score(fixture([[6,0,3]]));
  assert.equal(edge.scores[0].influence,3);
  assert.deepEqual(edge.influence.flatMap((s,i)=>s===0?[POINTS[i]]:[]),[{x:5,y:-1},{x:5,y:0},{x:5,y:1}]);
});

test('a tie is neutral; a third neighbour breaks it; reinforcement scores one point, not its strength',()=>{
  const tiles=[[-1,0,1],[1,0,-1]],p=at(0,0);
  for(const [extra,expected,counts]of [[[],-1,[1,1]],[[[0,1,3]],0,[2,1]],[[[0,1,3],[0,-1,-2]],-1,[2,2]]]){
    const result=score(fixture([...tiles,...extra]));
    assert.deepEqual(result.influenceCounts[p],counts);assert.equal(result.influence[p],expected);
    for(const side of [0,1])assert.equal(result.scores[side].influence,result.influence.filter(s=>s===side).length);
  }
  const result=score(fixture([[-1,0,1],[1,0,2],[0,1,3]]));
  assert.deepEqual(result.influenceCounts[p],[3,0]);
  assert.equal(result.scores[0].influence,result.influence.filter(s=>s===0).length);
});

test('both camps occupied points are excluded, without blocking diagonal influence',()=>{
  const state=fixture([[0,0,1],[1,0,-3],[0,1,2]]),result=score(state);
  for(const [x,y]of [[0,0],[1,0],[0,1]]){
    assert.equal(result.influence[at(x,y)],-1);assert.deepEqual(result.influenceCounts[at(x,y)],[0,0]);
  }
  assert.deepEqual(result.influenceCounts[at(1,1)],[2,1]);assert.equal(result.influence[at(1,1)],0);
});

test('immobilization and region declarations preserve influence while retaining the four-point prisoner score',()=>{
  const state=fixture([[0,0,1],[3,0,2],[0,2,3],[1,1,-1]]);
  const before=score(state);
  const declared={...state,selected:[[[at(0,0),at(3,0),at(0,2)].sort((a,b)=>a-b)],[]]};
  assert.ok(analyze(declared).frozen.has(at(1,1)));
  assert.deepEqual(score(declared).influenceCounts,before.influenceCounts);
  assert.deepEqual(score(declared).influence,before.influence);
  assert.equal(score(declared).scores[0].prisoners,4);
});

test('all 113 origins and two complete legal games match a separate influence census',()=>{
  function check(state){
    const expected=oracle(state),actual=score(state);
    assert.deepEqual(actual.influenceCounts,expected.counts);
    assert.deepEqual(actual.influence,expected.owners);
    assert.deepEqual(actual.scores.map(s=>s.influence),expected.totals);
  }
  for(const p of POINTS)check(fixture([[p.x,p.y,3]]));
  for(const seed of [23,71]){
    let state=initialState(15);const rng=new StableRng(seed);
    for(let step=0;!outcome(state);step++){
      assert.ok(step<1500);const actions=legalActions(state),action=actions[rng.index(actions.length)];
      const before=state;state=play(state,action);check(state);
      if(typeof action[0]==='number'){
        const origins=action.filter(p=>p>=0).map(p=>POINTS[p]);
        for(let p=0;p<POINTS.length;p++){
          const q=POINTS[p];
          if(origins.every(o=>Math.max(Math.abs(o.x-q.x),Math.abs(o.y-q.y))>1))
            assert.equal(score(before).influence[p],score(state).influence[p],'a move cannot flip distant influence');
        }
      }
    }
  }
});

test('turn credits and MCTS evaluate the local majority, including controlled leaf values',()=>{
  let state=fixture([[-1,0,1],[1,0,-1]]);
  state=play(state,[-3,at(0,1)]);
  const expected=oracle(state),delta=expected.totals[0]-expected.totals[1];
  assert.ok(delta>0);
  assert.equal(searchValue(state,0),Math.tanh(delta/24));
  const finished=play(state,['end-turn']);
  assert.deepEqual(cumulativeScore(finished).scores.map(s=>s.total),expected.totals);
  // Eight simulations expand distinct root leaves. With no rollout, every
  // reported value must equal the independent local-score evaluation.
  const result=search(state,8,19,{id:'local-score-check',candidates:1,rolloutDepth:0,widening:8});
  assert.equal(result.simulations,8);assert.match(result.protocol,/v14/);
  for(const entry of result.rootActions){
    const child=play(state,entry.action),local=oracle(child),remaining=2*child.turnLimit-child.ply;
    const banked=cumulativeScore(child).scores.map(s=>s.total);
    const value=Math.tanh((banked[0]-banked[1]+remaining*(local.totals[0]-local.totals[1]))/(24*Math.max(1,remaining)));
    assert.equal(entry.visits,1);assert.equal(entry.value,value);
  }
});

test('V11 remains byte-exact and retains global influence and cumulative replay semantics',()=>{
  const dir=new URL('../history/v11/',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',dir)));
  for(const [file,hash]of Object.entries(manifest))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(file,dir))).digest('hex'),hash);
  const actions=[[-3,at(0,0)],['end-turn']],record=v11.makeRecord(15,actions,null,2.5,{hemispheres:false,jadeHemisphere:'north',compensationSide:1});
  const states=view.replay(record),last=states.at(-1);
  assert.deepEqual(states,v11.replay(record));
  assert.equal(view.score(last).scores[0].influence,112);
  assert.deepEqual(view.cumulativeScore(last).scores.map(s=>s.total),[112,2.5]);
  assert.equal(view.cumulativeScore(last).turns,1);
  assert.deepEqual(view.makeRecordForState(states[0],actions,null),record);
  assert.throws(()=>search(last,8,1),/incompatible/);
});
