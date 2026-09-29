import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,legalActions,play,pointAt as at,sideToMove,makeRecord,replay} from '../src/engine.mjs';
const has=(s,a)=>legalActions(s).some(b=>JSON.stringify(a)===JSON.stringify(b));
test('hemispheres disabled by default; central line belongs to both placement zones',()=>{
 const plain=initialState(15);assert.equal(plain.setup,null);assert.ok(has(plain,[-1,at(0,-5)]));
 for(const jadeHemisphere of ['north','south']){const s=initialState(15,0,{hemispheres:true,jadeHemisphere});const sign=jadeHemisphere==='north'?1:-1;
 assert.ok(has(s,[-1,at(0,4*sign)]));assert.ok(!has(s,[-1,at(0,-4*sign)]));assert.ok(has(s,[-1,at(0,0)]));
 const next=play(s,[-1,at(0,4*sign)]);assert.equal(next.ply,0);assert.equal(sideToMove(next),1);assert.ok(has(next,[-1,at(0,-4*sign)]));assert.ok(!has(next,[-1,at(1,4*sign)]));
 }
});
test('initial placement alternates up to four free pieces from the twelve, then Jade starts',()=>{
 let s=initialState(15,0,{hemispheres:true});
 for(let i=0;i<4;i++){s=play(s,[-1,at(i,2)]);s=play(s,[-1,at(i,-2)]);}
 assert.equal(s.setup,null);assert.equal(s.ply,0);assert.equal(sideToMove(s),0);
 assert.equal(s.reserve[0][1],0);assert.equal(s.reserve[1][1],0);assert.deepEqual(s.credits,[0,0]);
 assert.ok(!has(s,['finish-setup']));
});
test('players can end setup early; setup choices consume no regular turn',()=>{
 let s=initialState(15,0,{hemispheres:true});s=play(s,['finish-setup']);assert.equal(sideToMove(s),1);
 s=play(s,[-3,at(0,-3)]);assert.equal(sideToMove(s),1);assert.equal(s.ply,0);
 s=play(s,['finish-setup']);assert.equal(s.setup,null);assert.equal(s.ply,0);assert.equal(sideToMove(s),0);
});
test('regular placements stay in hemisphere but movements may cross the equator',()=>{
 let s=initialState(15,0,{hemispheres:true});s=play(s,[-1,at(0,0)]);s=play(s,['finish-setup']);s=play(s,['finish-setup']);
 assert.ok(!has(s,[-2,at(2,-1)]));assert.ok(has(s,[at(0,0),at(0,-1)]));
 s=play(s,[at(0,0),at(0,-1)]);assert.equal(s.board[at(0,-1)],1);
});
test('setup options and choices survive verified replay',()=>{
 const options={hemispheres:true,jadeHemisphere:'south',compensationSide:0};
 const record=makeRecord(15,[[-2,at(0,-3)],['finish-setup'],['finish-setup']],null,2,options);
 const s=replay(record).at(-1);assert.equal(s.jadeHemisphere,'south');assert.equal(s.setup,null);assert.equal(s.compensationSide,0);assert.equal(s.compensation,2);
});
test('region choice after the eighth setup tile still leaves Jade at regular turn zero',()=>{
 const options={hemispheres:true,jadeHemisphere:'north',compensationSide:1};
 const actions=[[-1,at(-3,3)],[-1,at(0,-1)],[-1,at(-2,3)],[-1,at(2,-1)],[-1,at(-1,3)],[-2,at(0,-3)],[-1,at(0,3)],[-3,at(2,-3)]];
 let s=initialState(15,2,options);for(const action of actions)s=play(s,action);
 assert.equal(s.setup,null);assert.equal(s.turnKind,'setup');assert.equal(s.resolution.side,1);assert.equal(s.ply,0);
 s=play(s,['decline']);assert.equal(s.ply,0);assert.equal(sideToMove(s),0);assert.equal(s.turnKind,null);
 assert.deepEqual(replay(makeRecord(15,[...actions,['decline']],null,2,options)).at(-1),s);
});
