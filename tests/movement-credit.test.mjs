import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,play,legalActions,pointAt as at,maximumActions,sideToMove,makeRecord,replay} from '../src/engine.mjs';
function board(){const s=initialState();s.board[at(0,0)]=1;s.board[at(0,4)]=-1;s.reserve[0][1]--;s.reserve[1][1]--;return s;}
const move=(s,x,y,u,v)=>play(s,[at(x,y),at(u,v)]);
function opponentPose(s){return play(play(s,[-2,at(-4,-2)]),['end-turn']);}
test('one or two pieces may supply two movements with an independent placement available',()=>{let s=board();s.board[at(3,0)]=1;s.reserve[0][1]--;s=move(s,0,0,1,0);assert.equal(s.ply,0);assert.equal(s.movesThisTurn,1);assert.ok(legalActions(s).some(a=>typeof a[0]==='number'&&a[0]<0));s=move(s,3,0,3,1);assert.equal(s.movesThisTurn,2);s=play(s,['end-turn']);assert.equal(s.ply,1);assert.equal(s.credits[0],0);});
test('third movement borrows; next movement turn forced to one, no rolling loan',()=>{let s=board();s=move(s,0,0,1,0);s=move(s,1,0,2,0);s=move(s,2,0,3,0);s=play(s,['end-turn']);assert.equal(s.ply,1);assert.equal(s.credits[0],-1);s=opponentPose(s);assert.equal(maximumActions(s),1);s=move(s,3,0,4,0);s=play(s,['end-turn']);assert.equal(s.ply,3);assert.equal(s.credits[0],0);});
test('saving, carrying through a two-move turn, spending, cap at one',()=>{let s=board();s=move(s,0,0,1,0);s=play(s,['end-turn']);assert.equal(s.credits[0],1);s=opponentPose(s);s=move(s,1,0,2,0);s=move(s,2,0,1,0);s=play(s,['end-turn']);assert.equal(s.credits[0],1);s=play(play(s,[-2,at(-3,-2)]),['end-turn']);s=move(s,1,0,2,0);s=play(s,['end-turn']);assert.equal(s.credits[0],1);s=play(play(s,[-2,at(-2,-2)]),['end-turn']);s=move(s,2,0,1,0);s=play(s,['end-turn']);assert.equal(s.credits[0],1);s=play(play(s,[-2,at(-1,-2)]),['end-turn']);s=move(s,1,0,2,0);s=move(s,2,0,3,0);s=move(s,3,0,4,0);s=play(s,['end-turn']);assert.equal(s.credits[0],0);});
test('a placement itself changes neither movement count nor credit',()=>{for(const credit of [-1,0,1]){let s=initialState();s.credits[0]=credit;s=play(s,[-1,at(0,0)]);assert.equal(s.ply,0);assert.equal(s.credits[0],credit);assert.equal(s.movesThisTurn,0);assert.equal(sideToMove(s),0);}});
test('cannot finish a turn without a placement or movement',()=>{assert.throws(()=>play(initialState(),['end-turn']));});
test('records preserve compound movement turns and credits',()=>{const actions=[[-1,at(0,0)],['end-turn'],[-1,at(0,4)],['end-turn'],[at(0,0),at(1,0)],['end-turn']];const r=makeRecord(30,actions);const s=replay(r).at(-1);assert.equal(s.credits[0],1);assert.equal(s.ply,3);});
test('opponent chooses regional rearrangements inside the mover turn before continuation',()=>{
 let s=initialState();
 const entries=[[0,0,-1],[3,0,-2],[0,2,-3],[4,-4,-1],[-1,-1,1],[2,-1,2],[-1,4,3]];
 for(const[x,y,v]of entries){s.board[at(x,y)]=v;s.reserve[v>0?0:1][Math.abs(v)]--;}
 s.selected[1]=[[at(0,0),at(3,0),at(0,2)].sort((a,b)=>a-b)];
 s=move(s,-1,4,-1,1);
 assert.equal(sideToMove(s),0);assert.equal(s.movesThisTurn,1);
 s=play(s,legalActions(s).find(a=>a[0]==='region'));
 assert.equal(sideToMove(s),1);assert.equal(s.ply,0);assert.equal(s.movesThisTurn,1);
 s=play(s,['decline']);assert.equal(sideToMove(s),0);assert.equal(s.ply,0);
 assert.ok(legalActions(s).some(a=>typeof a[0]==='number'));assert.ok(legalActions(s).some(a=>a[0]==='end-turn'));
});
