import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,pointAt as at,play,legalActions,analyze,sideToMove} from '../src/engine.mjs';
const has=(s,a)=>legalActions(s).some(b=>JSON.stringify(a)===JSON.stringify(b));
test('one placement is independent of the movement quota and stock',()=>{
 let s=initialState(15);s=play(s,[-1,at(0,0)]);assert.equal(s.ply,0);assert.equal(s.movesThisTurn,0);assert.equal(s.placedThisTurn,true);assert.equal(s.reserve[0][1],3);assert.equal(s.credits[0],0);
 assert.ok(!legalActions(s).some(a=>typeof a[0]==='number'&&a[0]<0));
 s=play(s,[at(0,0),at(1,0)]);s=play(s,[at(1,0),at(2,0)]);assert.equal(s.ply,0);assert.equal(s.movesThisTurn,2);
 s=play(s,[at(2,0),at(3,0)]);assert.equal(s.ply,1);assert.equal(s.credits[0],-1);assert.equal(s.placedThisTurn,false);
});
test('a placement can follow movements without resetting their count',()=>{
 let s=initialState();s.board[at(0,0)]=1;s.reserve[0][1]--;
 s=play(s,[at(0,0),at(1,0)]);s=play(s,[-2,at(-3,0)]);assert.equal(s.movesThisTurn,1);assert.equal(s.ply,0);
 s=play(s,['end-turn']);assert.equal(s.credits[0],1);assert.equal(s.ply,1);
});
test('placement-only turn is legal, unused movement credits cap at one, but empty pass is illegal',()=>{
 let s=initialState();assert.throws(()=>play(s,['end-turn']));s=play(s,[-1,at(0,0)]);s=play(s,['end-turn']);assert.equal(s.credits[0],1);
});
test('last turn allows one placement and one movement in either order',()=>{
 for(const placeFirst of [false,true]){let s=initialState(15);s.ply=28;s.board[at(0,0)]=1;s.reserve[0][1]--;s.credits=[1,0];
 const move=[at(0,0),at(1,0)],pose=[-2,at(-3,0)];s=play(s,placeFirst?pose:move);assert.equal(s.ply,28);s=play(s,placeFirst?move:pose);assert.equal(s.ply,29);assert.equal(sideToMove(s),1);}
});
test('region choices interrupt a pose before the same player resumes movements',()=>{
 let s=initialState();for(const[x,y,n]of [[0,0,1],[3,0,2]]){s.board[at(x,y)]=n;s.reserve[0][n]--;}
 s=play(s,[-3,at(0,2)]);assert.ok(s.resolution);assert.equal(s.ply,0);s=play(s,legalActions(s).find(a=>a[0]==='region'));assert.equal(analyze(s).regions[0][0].status,'active');assert.equal(s.ply,0);assert.equal(sideToMove(s),0);assert.ok(has(s,[at(0,0),at(-1,0)]));
});
