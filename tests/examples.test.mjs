import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {RULES,STOCK,MAX_ACTIVE_REGIONS,replay,analyze,sideToMove} from '../history/v9/engine.mjs';
const dir=new URL('../history/v9/examples/',import.meta.url);
test('18 historical V9 paired MCTS replays obey inventory, region cap and covered geometry',()=>{
 const index=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
 assert.equal(index.rules,RULES);assert.equal(index.games.length,18);
 const configurations=new Set();
 for(const game of index.games){
  configurations.add(`${game.turnLimit}:${game.players.join(':')}`);
  const body=fs.readFileSync(new URL(game.file,dir));
  assert.equal(crypto.createHash('sha256').update(body).digest('hex'),game.sha256);
  const record=JSON.parse(body),states=replay(record);
  assert.deepEqual(record.result,game.result);assert.ok(['turn-limit','region-loop','no-legal-action'].includes(record.result.reason));
  if(record.result.reason==='turn-limit')assert.equal(states.at(-1).ply,2*game.turnLimit);
  const turnCounts=new Map();
  for(const [i,action]of record.actions.entries()){
   const before=states[i],after=states[i+1];
   if(action[0]==='region')assert.equal(analyze(after).regions[sideToMove(before)].find(r=>r.key===action.slice(1).join(','))?.status,'active');
   if(!before.setup&&typeof action[0]==='number'){
    const count=turnCounts.get(before.ply)??{poses:0,moves:0};action[0]<0?count.poses++:count.moves++;
    assert.ok(count.poses<=1);assert.ok(count.moves<=(before.ply>=2*(before.turnLimit-1)?1:3));turnCounts.set(before.ply,count);
   }
  }
  for(const state of states){
   const derived=analyze(state);
   for(const side of [0,1]){
    const active=derived.regions[side].filter(r=>r.status==='active');
    assert.ok(active.length<=MAX_ACTIVE_REGIONS);
    assert.equal(new Set(active.flatMap(r=>r.vertices)).size,active.length*3);
    for(let n=1;n<=3;n++)assert.equal(state.board.filter(v=>v===(side===0?n:-n)).length+state.reserve[side][n],STOCK[n]);
    for(const r of derived.candidates[side])assert.ok(r.inside.length>=1&&r.inside.length<=5);
   }
  }
 }
 assert.equal(configurations.size,18);
});
