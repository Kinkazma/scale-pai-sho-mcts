import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GENERATIONS,DEFAULT_GENERATION,DEFAULT_BUDGET,generationBudgets,generationProfile,gameAgents,restoreAgents} from '../src/ai-generations.mjs';
import {initialState,sideToMove,playLegal,legalActions} from '../src/engine.mjs';
import {createSearchSession} from '../src/search-runtime.mjs';
import {profileForBudget} from '../src/search.mjs';
import {SearchController} from '../src/search-controller.mjs';

test('published generations preserve frozen G1/G2/G3 parameters and defaults',()=>{
 assert.equal(DEFAULT_GENERATION,3);assert.equal(DEFAULT_BUDGET,32);
 for(const g of GENERATIONS){
  const frozen=JSON.parse(fs.readFileSync(new URL(`../profiles/gen${g.id}.json`,import.meta.url)));
  for(const [budget,p] of Object.entries(frozen.profiles))assert.deepEqual(generationProfile(Number(budget),g.id),p);
 }
 assert.deepEqual(generationBudgets(3),[8,32]);assert.deepEqual(generationBudgets(2),[8,16,32,64]);
 for(const b of generationBudgets(1))assert.deepEqual(generationProfile(b,1),profileForBudget(b));
 assert.throws(()=>generationProfile(64,3),/unavailable/);
});
test('agents snapshot and old saves preserve actual models without upgrading',()=>{
 const players=['human','32'],generations=[3,3],a=gameAgents(players,generations,'42');
 players[1]='8';generations[1]=1;assert.equal(a.players[1],'32');assert.equal(a.generations[1],3);
 assert.deepEqual(restoreAgents(JSON.parse(JSON.stringify(a))),a);
 const old=restoreAgents({players:['human','32'],seed:'42'});
 assert.equal(old.generations[1],1);assert.deepEqual(old.profiles[1],generationProfile(32,1));
 const custom={...generationProfile(32,2),id:'archived-custom'};
 assert.deepEqual(restoreAgents({players:['32','human'],profiles:[custom,null]}).profiles[0],custom);
});
test('browser controller executes the frozen profile with campaign-equivalent decisions and history',()=>{
 const strip=x=>{const copy=structuredClone(x);delete copy.milliseconds;if(copy.repetitionGuard)delete copy.repetitionGuard.milliseconds;return copy;};
 for(const generation of [1,2,3]){
  const profile=generationProfile(32,generation),controller=new SearchController(),sessions=[createSearchSession(profile),createSearchSession(profile)];
  let state=initialState(15),history=[];
  for(let step=0;step<12;step++){
   const seed=BigInt(300+generation)+BigInt(step)*1000003n;
   const expected=sessions[sideToMove(state)].search(state,32,seed),actual=controller.decide({state,budget:32,seed,profile,history});
   assert.deepEqual(strip(actual),strip(expected));assert.ok(legalActions(state).some(a=>JSON.stringify(a)===JSON.stringify(actual.action)));
   state=playLegal(state,actual.action);history.push(actual.action);for(const session of sessions)session.advance(actual.action,state);
  }
 }
});
test('switching generation isolates retained search trees',()=>{
 const c=new SearchController(),state=initialState(15);
 const old=c.decide({state,budget:8,seed:7,profile:generationProfile(8,1)});
 const next=c.decide({state,budget:8,seed:7,profile:generationProfile(8,3)});
 assert.notEqual(old.profile.id,next.profile.id);assert.equal(c.sessions.size,2);
});
