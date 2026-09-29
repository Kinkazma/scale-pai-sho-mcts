import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as e from '../src/engine.mjs';
import * as old from '../history/v13/engine.mjs';
import * as view from '../src/replay-engine.mjs';
import {search} from '../src/search-runtime.mjs';
import {relationalProfile} from '../src/relational-profile.mjs';
import {searchValue} from '../src/search.mjs';
import {recoverPeerRecord} from '../src/peer-history.mjs';

const at=e.pointAt,vertices=[[0,0],[3,0],[0,2]].map(p=>at(...p)).sort((a,b)=>a-b);
const captureAction=['region',...vertices];
function prefix(tile=1,winner=0){
 const actions=[];let state=e.initialState(30,10000,{compensationSide:1-winner});
 const apply=a=>{state=e.play(state,a);actions.push(a);};
 const own=[[1,0,0],[2,3,0],[1,-5,0],[1,-4,-4]],enemy=[[tile,1,0],[tile,2,0],[tile,0,1],[tile,1,1]];
 const pose=([n,x,y])=>{apply([-n,at(x,y)]);apply(['end-turn']);};
 for(let i=0;i<4;i++)for(const row of winner===0?[own[i],enemy[i]]:[enemy[i],own[i]])pose(row);
 if(winner===1)pose([tile===2?3:2,4,0]);
 apply([-3,at(0,2)]);
 assert(e.legalActions(state).some(a=>JSON.stringify(a)===JSON.stringify(captureAction)));
 return {state,actions};
}
test('four same-type captures win for either camp and every type from a legal empty-board prefix',()=>{
 for(const tile of [1,2,3])for(const winner of [0,1]){
  const {state,actions}=prefix(tile,winner),next=e.play(state,captureAction),result=e.outcome(next);
  assert.equal(result.reason,'four-identical-captured');assert.equal(result.winner,winner);assert.equal(result.tile,tile);
  assert(result.scores[1-winner].total>result.scores[winner].total,'winner need not lead on score');
  assert.equal(next.resolution,null);assert.equal(next.ply,state.ply);assert.deepEqual(next.scoreLedger,state.scoreLedger);
  assert.deepEqual(e.legalActions(next),[]);assert.throws(()=>e.play(next,['end-turn']),/interdit/);
  assert.equal(searchValue(next,winner,true),1);assert.equal(searchValue(next,1-winner,true),-1);
  const r=e.makeRecord(30,[...actions,captureAction],null,10000,{compensationSide:1-winner});
  assert.deepEqual(e.replay(r).at(-1),next);
 }
});
function controlled(triangles,pieces){
 const s=e.initialState();
 for(const [side,tile,x,y]of pieces){const p=at(x,y);assert.equal(s.board[p],0);s.board[p]=(side===0?1:-1)*tile;s.reserve[side][tile]--;assert(s.reserve[side][tile]>=0);}
 s.selected=triangles.map(group=>group.map(v=>v.map(p=>at(...p)).sort((a,b)=>a-b)));return s;
}
test('several active regions combine distinct captures; overlap never counts a tile twice',()=>{
 const t=[[[0,0],[3,0],[0,2]],[[1,-1],[4,-1],[1,1]]];
 const own=t.flatMap(v=>v.map(([x,y],i)=>[0,i+1,x,y]));
 const s=controlled([t,[]],[...own,[1,1,1,0],[1,1,2,0],[1,1,0,1]]);
 assert.equal(e.analyze(s).frozen.size,3);assert.equal(e.captureVictory(s),null);assert.equal(e.outcome(s),null);
 const more={...s,board:s.board.slice(),reserve:s.reserve.map(r=>r.slice())};more.board[at(3,-1)]=-1;more.reserve[1][1]--;
 assert.equal(e.analyze(more).frozen.size,4);assert.equal(e.outcome(more).winner,0);
 assert(e.analyze(more).regions[0].every(r=>r.inside.filter(p=>more.board[p]===-1).length<4));
 const freed={...s,selected:[[s.selected[0][1]],[]]};assert.equal(e.analyze(freed).frozen.size,2);assert.equal(e.captureVictory(freed),null);
});
test('three of one type and one of another do not win',()=>{
 const {state}=prefix();const next=e.play(state,captureAction);
 const mixed={...next,board:next.board.slice(),reserve:next.reserve.map(r=>r.slice())};
 mixed.board[at(1,1)]=-2;mixed.reserve[1][1]++;mixed.reserve[1][2]--;
 assert.equal(e.analyze(mixed).frozen.size,4);assert.equal(e.captureVictory(mixed),null);assert.equal(e.outcome(mixed),null);
});
test('a suspended region does not capture; reactivation wins immediately during the opponent turn',()=>{
 const t0=[[0,0],[3,0],[0,2]],t1=[[-1,-1],[1,0],[-1,1]];
 const s=controlled([[t0],[t1]],[[0,1,0,0],[0,2,3,0],[0,3,0,2],[1,1,1,0],[1,1,2,0],[1,1,0,1],[1,1,1,1],[1,2,-1,-1],[1,3,-1,1]]);
 s.ply=1;s.regionActivity={[`0:${s.selected[0][0].join(',')}`]:false,[`1:${s.selected[1][0].join(',')}`]:true};
 assert.equal(e.analyze(s).regions[0][0].status,'suspended');assert.equal(e.captureVictory(s),null);
 const next=e.play(s,[at(-1,-1),at(-3,-1)]);
 assert.equal(e.analyze(next).regions[0][0].status,'active');assert.equal(e.outcome(next).winner,0);
 assert.equal(e.outcome(next).reason,'four-identical-captured');assert.equal(next.resolution,null);
 assert.deepEqual(next.scoreLedger,s.scoreLedger);assert.deepEqual(e.legalActions(next),[]);
});
test('all three search paths choose the winning declaration and stop at its terminal state',()=>{
 const {state}=prefix();
 for(const profile of [{id:'plain',candidates:1},{id:'retained',searchVersion:'retained-solver-v1'},relationalProfile({id:'relations',repetitionPolicy:'avoid-stagnation-v1'})])for(const budget of [8,32]){
  const result=search(state,budget,77,profile),next=e.play(state,result.action);
  assert.equal(e.outcome(next)?.winner,0);assert.equal(search(next,budget,77,profile).action,null);
 }
});
test('capture outcome precedes pending reactions, block and turn limit; loop losses stay first',()=>{
 const {state}=prefix(),won=e.play(state,captureAction);
 const pending={...won,resolution:{side:1,order:[1,0],options:[]},ply:60};
 assert.equal(e.outcome(pending).reason,'four-identical-captured');assert.deepEqual(e.legalActions(pending),[]);
 const loop={...won,loopLoss:{loser:0,cycle:[]}};assert.equal(e.outcome(loop).winner,1);assert.equal(e.outcome(loop).reason,'region-loop');
});
test('V13 archives retain their former continuation and online exports; V14 rejects moves after the new win',()=>{
 const {actions}=prefix(),r=old.makeRecord(30,[...actions,captureAction,['end-turn']],null,10000,{compensationSide:1});
 const states=view.replay(r);assert.equal(view.outcome(states.at(-1)),null);assert.equal(r.rules,old.RULES);
 const saved={rules:r.rules,settings:{turnLimit:30,compensation:10000,options:{compensationSide:1}},actions:r.actions};
 assert.deepEqual(recoverPeerRecord(saved).actions,r.actions);
 assert.throws(()=>e.replay({...r,rules:e.RULES}),/interdit/);
 for(const [name,hash]of Object.entries(JSON.parse(fs.readFileSync(new URL('../history/v13/manifest.json',import.meta.url)))))
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../history/v13/'+name,import.meta.url))).digest('hex'),hash);
});
test('a legally reached opponent reaction wins during the other player turn, despite trailing on score',()=>{
 const actions=[[-1,57],['end-turn'],[-1,56],['end-turn'],[-2,54],['end-turn'],[-2,60],['end-turn'],[-3,34],['region',34,54,57],['end-turn'],[-3,80],['end-turn'],[-1,58],['end-turn'],[-1,51],['end-turn'],[-1,59],['end-turn'],[-1,8],['end-turn'],[-1,69],['end-turn'],[-1,96],['decline'],['end-turn'],[57,70],['decline'],['region',56,60,80]];
 const states=e.replay({rules:e.RULES,turnLimit:30,actions}),before=states.at(-2),after=states.at(-1);
 assert.equal(before.ply%2,0);assert.equal(e.sideToMove(before),1);assert.equal(e.outcome(before),null);
 assert.equal(e.outcome(after).winner,1);assert.deepEqual(e.cumulativeScore(after).scores.map(s=>s.total),[180,136]);
 assert.deepEqual(after.scoreLedger,before.scoreLedger);assert.deepEqual(e.legalActions(after),[]);
});
