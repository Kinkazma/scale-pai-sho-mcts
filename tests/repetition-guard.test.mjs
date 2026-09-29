import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,play,playLegal,legalActions,pointAt as at,analyze,score,outcome} from '../src/engine.mjs';
import {repetitionKey,repeatedSuffix,avoidRepeatedChoice,RepetitionGuardSession,REPETITION_POLICY} from '../src/repetition-guard.mjs';
import {createSearchSession} from '../src/search-runtime.mjs';
import {relationalProfile} from '../src/relational-profile.mjs';

test('bounded periodic detector requires the entire repeated suffix, not a repeated move token',()=>{
 assert.equal(repeatedSuffix(['a','b','a'],'b'),null);
 const h=Array.from({length:25},(_,i)=>i%2?'b':'a');assert(repeatedSuffix(h,'b'));
 h[20]='different';assert.equal(repeatedSuffix(h,'b'),null);
});
test('repetition projection keeps score progress, quotas, reserves, regional history and final turn',()=>{
 const s=initialState(15),k=repetitionKey(s);
 for(const changes of [{credits:[1,0]},{movesThisTurn:1},{reserve:[[0,3,4,4],[0,4,4,4]]},
  {regionHistory:[{different:true}]},{scoreLedger:{...s.scoreLedger,totals:[1,0],advantageTotals:[1,0]}},{ply:28}])assert.notEqual(repetitionKey({...s,...changes}),k);
 assert.equal(repetitionKey({...s,ply:2}),k); // Deliberately a behavioral projection, not state identity.
});
test('choice filter avoids a completed stagnant cycle without changing visits or proof domain',()=>{
 const s=initialState(15),a=[-1,at(0,0)],b=[-2,at(0,0)],next=repetitionKey(play(s,a));
 const h=Array.from({length:25},(_,i)=>i%2?next:repetitionKey(s));
 const r={action:a,proof:'unknown',simulations:8,rootActions:[{action:a,visits:7,value:.1,proof:'unknown'},{action:b,visits:1,value:0,proof:'unknown'}]};
 const guarded=avoidRepeatedChoice(s,r,h);assert.deepEqual(guarded.action,b);assert(guarded.repetitionGuard.avoided);
 assert.equal(guarded.rootActions,r.rootActions);assert.equal(guarded.simulations,8);assert.equal(guarded.proof,r.proof);
 const winning={...r,rootActions:[{...r.rootActions[0],proof:0},r.rootActions[1]]};
 assert.deepEqual(avoidRepeatedChoice(s,winning,h).action,a);
});
test('legal movement cycle is detected, while its score-gaining counterpart is not equated',()=>{
 let s=initialState(30);for(const a of [[-1,at(-3,0)],['end-turn'],[-1,at(3,0)],['end-turn']])s=play(s,a);
 const history=[repetitionKey(s)];let detected=false;
 for(let round=0;round<10;round++){
  const from=round%2?1:0,to=1-from;
  for(const a of [[at(-3,from),at(-3,to)],['end-turn'],[at(3,from),at(3,to)],['end-turn']]){
   const next=play(s,a),k=repetitionKey(next);if(repeatedSuffix(history,k))detected=true;
   history.push(k);s=next;
  }
 }
 assert(detected);
 assert.notEqual(repetitionKey({...s,scoreLedger:{...s.scoreLedger,totals:s.scoreLedger.totals.map(x=>x+1),advantageTotals:s.scoreLedger.advantageTotals.map(x=>x+1)}}),repetitionKey(s));
});
test('live-state advance and prefix reconstruction give the same guard history',()=>{
 const profile=relationalProfile({repetitionPolicy:REPETITION_POLICY}),direct=createSearchSession(profile),replayed=createSearchSession(profile);
 let s=initialState(15);direct.search(s,8,1);
 for(const action of [[-1,at(-3,0)],['end-turn'],[-1,at(3,0)],['end-turn']]){
  s=play(s,action);direct.advance(action,s);replayed.advance(action);
 }
 const a=direct.search(s,8,4),b=replayed.search(s,8,4);
 assert.deepEqual(direct.history,replayed.history);assert.deepEqual(a.action,b.action);
 assert.throws(()=>createSearchSession({...profile,repetitionPolicy:'unknown'}));
});
test('shared immutable geometry never shares cumulative values or different declarations',()=>{
 const a=initialState(15),b={...a,ply:2,scoreLedger:{...a.scoreLedger,totals:[50,0]}};
 assert.equal(analyze(a),analyze(b));assert.equal(score(a),score(b));
 const c={...a,regionActivity:{different:true}};assert.notEqual(analyze(a),analyze(c));
});
test('an unvisited immediate loss is never the escape from a stagnant cycle',()=>{
 const s=initialState(15);s.ply=29;s.movesThisTurn=1;s.scoreLedger.totals=[1000,0];s.scoreLedger.advantageTotals=[1000,0];
 for(const [x,y,type]of [[-3,0,1],[0,0,2]]){s.board[at(x,y)]=-type;s.reserve[1][type]--;}
 const action=[-3,at(-3,2)],next=play(s,action);assert.equal(outcome(next),null);
 assert.equal(outcome(play(s,legalActions(s)[0]))?.winner,0); // Previously selected by the fallback.
 const h=Array.from({length:25},(_,i)=>i%2?repetitionKey(next):repetitionKey(s));
 const r={action,proof:'unknown',rootActions:[{action,visits:8,value:0,proof:'unknown'}]};
 const guarded=avoidRepeatedChoice(s,r,h);assert(guarded.repetitionGuard.avoided);
 assert.notEqual(outcome(play(s,guarded.action))?.winner,0);
});
test('guard retains a legal fallback when every escape has a known losing proof',()=>{
 const s=initialState(15),action=legalActions(s)[0],next=play(s,action);
 const h=Array.from({length:25},(_,i)=>i%2?repetitionKey(next):repetitionKey(s));
 const rootActions=legalActions(s).map(a=>({action:a,proof:JSON.stringify(a)===JSON.stringify(action)?'unknown':1,visits:1,value:0}));
 const r=avoidRepeatedChoice(s,{action,proof:'unknown',rootActions},h);
 assert(r.repetitionGuard.forced);assert.deepEqual(r.action,action);assert.equal(r.proof,'unknown');
});
test('guard time includes historical replay and filtering instead of forwarding the inner timer',()=>{
 const s=initialState(15),inner={search:()=>({action:null,milliseconds:0,rootActions:[]}),advance:()=>false};
 const guard=new RepetitionGuardSession(inner);guard.search(s,8,1);
 const a=legalActions(s)[0],next=play(s,a);guard.advance(a,next);const r=guard.search(next,8,1);
 assert(r.milliseconds>0);assert.equal(guard.advanceMilliseconds,0);
});
