import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,play,pointAt as at,score,legalActions,analyze,sideToMove} from '../src/engine.mjs';
import {positionRelations,tacticalPriority,RELATION_FEATURES} from '../src/triangle-relations.mjs';
import {relationalProfile} from '../src/relational-profile.mjs';
import {relationalValue} from '../src/relational-value.mjs';
import {searchValue,createSearchSession as oldSession} from '../src/search.mjs';
import {createSearchSession,search} from '../src/search-runtime.mjs';
import {tacticalContinuation} from '../src/tactical-continuation.mjs';
import {RETAINED_SEARCH} from '../src/search-memory.mjs';
function witness(){let s=initialState(15);for(const[t,x,y]of [[1,1,1],[1,0,0],[2,-4,-2],[2,2,0],[3,-3,-4]])for(const a of [[-t,at(x,y)],['end-turn']])s=play(s,a);return s;}
function position(tiles,selected=[[],[]]){const s=initialState();for(const[t,x,y]of tiles){s.board[at(x,y)]=t;s.reserve[t>0?0:1][Math.abs(t)]--;}s.selected=selected;return s;}
const has=(actions,action)=>actions.some(a=>JSON.stringify(a)===JSON.stringify(action));

test('two-piece completion and legal freezing distinction are visible to the new evaluator',()=>{
  const s=witness(),facts=positionRelations(s),action=[-3,at(0,2)];
  assert(facts.pairs[1].some(p=>p.missingType===3&&p.completions.some(c=>c.point===at(0,2))));
  assert(facts.plans[1].get(JSON.stringify(action)).victims.includes(at(1,1)));
  const good=play(s,action),other=play(s,[-1,at(0,2)]),profile=relationalProfile();
  assert.equal(searchValue(good,1),searchValue(other,1));
  assert(relationalValue(good,1,false,profile)>relationalValue(other,1,false,profile));
  assert(has(legalActions(good),['region',at(0,0),at(2,0),at(0,2)]));
});
test('non-triangular trio retains a legal one-move reconfiguration',()=>{
  const s=position([[1,0,0],[2,2,0],[3,0,5],[-1,1,1]]),move=[at(0,5),at(0,2)];
  assert(has(legalActions(s),move));const facts=positionRelations(s),trio=facts.trios[0][0];
  assert.equal(trio.inside,null);assert(trio.reconfigurations.some(x=>x.from===move[0]&&x.to===move[1]));
  assert(tacticalPriority(s,move)>0);assert(legalActions(play(s,move)).some(a=>a[0]==='region'));
});
test('moving a vertex of an active region exposes the new reconfiguration',()=>{
  const vertices=[at(0,0),at(3,0),at(0,2)].sort((a,b)=>a-b);
  const s=position([[1,0,0],[2,3,0],[3,0,2]],[ [vertices],[] ]),move=[at(0,2),at(3,2)];
  assert(has(legalActions(s),move));assert(positionRelations(s).plans[0].has(JSON.stringify(move)));
  assert(has(legalActions(play(s,move)),['region',at(0,0),at(3,0),at(3,2)]));
});
test('threat bonus is incremental when an enemy triangle is already held',()=>{
  const a=[at(0,0),at(3,0),at(0,2)].sort((a,b)=>a-b),b=[at(-1,-1),at(2,-1),at(-1,1)].sort((a,b)=>a-b);
  const s=position([[1,0,0],[2,3,0],[3,0,2],[-1,-1,-1],[-2,2,-1],[-3,-1,1],[-1,2,0],[-2,4,0]],[[a],[b]]);
  s.ply=1;const action=[-3,at(2,1)],facts=positionRelations(s);
  assert.equal(score(s).scores[1].prisoners,8);assert.equal(facts.plans[1].get(JSON.stringify(action)).captureValue,4);
  const next=play(s,action);
  const region=legalActions(next).find(a=>a[0]==='region'&&a.slice(1).includes(at(4,0))&&a.slice(1).includes(at(2,1)));
  assert(region);assert.equal(score(play(next,region)).scores[1].prisoners,12);
});
test('neutral relational profile reproduces retained search decisions and values exactly',()=>{
  const old={id:'neutral',searchVersion:RETAINED_SEARCH,candidates:4,rolloutDepth:0,solver:false};
  const next=relationalProfile({...old,weights:Object.fromEntries(RELATION_FEATURES.map(k=>[k,0])),tacticalDepth:0,tacticalOrdering:false});
  for(const state of [initialState(15),witness()])for(const budget of [8,32]){
    const a=oldSession(old).search(state,budget,73),b=createSearchSession(next).search(state,budget,73);
    for(const key of ['action','rootActions','simulations','inheritedVisits','maxDepth'])assert.deepEqual(b[key],a[key]);
  }
});
test('tactical continuation respects actual reaction ownership and a global work bound',()=>{
  const s=play(witness(),[-3,at(0,2)]);assert.equal(sideToMove(s),1);
  const profile=relationalProfile({tacticalDepth:16,tacticalNodes:5,tacticalWidth:2});
  const r=tacticalContinuation(s,profile,relationalValue);assert(r.nodes<=5);assert(r.maxDepth<=16);assert(!Object.hasOwn(r,'proof'));
  const result=search(witness(),32,4,profile);assert(result.tacticalNodes<=5);assert(result.maxDepth>=1);
  assert.equal(result.simulations,32);assert.equal(result.proof,'unknown');assert(has(legalActions(witness()),result.action));
});
test('profile rejects malformed weights and accepts distinct deeper tactical and rollout controls',()=>{
  assert.throws(()=>relationalProfile({weights:{invented:1}}));assert.throws(()=>relationalProfile({weights:{mobility:NaN}}));
  assert.throws(()=>relationalProfile({tacticalNodes:129}));assert.throws(()=>relationalProfile({tacticalDepth:1.5}));
  assert.equal(relationalProfile({rolloutDepth:32,tacticalDepth:32}).rolloutDepth,32);
});
