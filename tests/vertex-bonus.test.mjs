import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,pointAt as at,score,analyze,trianglePoints} from '../src/engine.mjs';
const A=[[0,0],[3,0],[0,2]],B=[[-1,-1],[2,-1],[-1,1]];
function board(declared=true){const s=initialState();for(const [side,v]of [[0,A],[1,B]])v.forEach(([x,y],i)=>{s.board[at(x,y)]=(side===0?1:-1)*(i+1);s.reserve[side][i+1]--;});s.selected=[declared?[A.map(p=>at(...p)).sort((a,b)=>a-b)]:[],[B.map(p=>at(...p)).sort((a,b)=>a-b)]];return s;}
test('immobilized vertex of a suspended declared triangle scores eight points',()=>{
 const s=board();assert.equal(analyze(s).regions[0][0].status,'suspended');
 const bonus=score(s).scores[1];assert.equal(bonus.prisoners,8);assert.equal(bonus.frozenCount,1);assert.equal(bonus.vertexPrisoners,1);
});
test('unselected candidate and ordinary frozen piece remain worth four',()=>{
 const s=board(false),bonus=score(s).scores[1];assert.equal(bonus.prisoners,4);assert.equal(bonus.vertexPrisoners,0);assert.equal(bonus.frozenCount,1);
});
test('multiple covering regions count a frozen vertex once; removed declaration loses role bonus',()=>{
 const s=board(),other=[[-2,-1],[1,-1],[1,1]];
 other.forEach(([x,y],i)=>{s.board[at(x,y)]=-(i+1);s.reserve[1][i+1]--;});
 s.selected[1].push(other.map(p=>at(...p)).sort((a,b)=>a-b));
 assert.equal(analyze(s).regions[1].filter(r=>r.status==='active'&&r.inside.includes(at(0,0))).length,2);
 assert.equal(score(s).scores[1].prisoners,8);
 const removed={...s,selected:[[],s.selected[1]]};assert.equal(score(removed).scores[1].prisoners,4);
});
function positionWithEnemyTriangles(triangles){
 const s=initialState();
 for(const [side,groups] of [[0,[A]],[1,triangles]])for(const v of groups){
   const points=v.map(p=>at(...p));assert.ok(trianglePoints(...points));
   points.forEach((p,i)=>{assert.equal(s.board[p],0);s.board[p]=(side?-1:1)*(i+1);s.reserve[side][i+1]--;});
   s.selected[side].push([...points].sort((a,b)=>a-b));
 }
 return s;
}
test('two captured vertices of one triangle yield 12, not 16',()=>{
 const s=positionWithEnemyTriangles([[[1,0],[2,0],[3,-2]]]),result=score(s).scores[0];
 assert.equal(result.frozenCount,2);assert.equal(result.capturedTriangles,1);
 assert.equal(result.triangleBonus,4);assert.equal(result.prisoners,12);
});
test('one region capturing vertices of two or three distinct triangles yields 16 or 24',()=>{
 const triangles=[[[1,0],[0,-6],[-1,-5]],[[2,0],[-3,-5],[-2,-5]],[[0,1],[1,-5],[2,-5]]];
 for(const count of [2,3]){
  const s=positionWithEnemyTriangles(triangles.slice(0,count)),result=score(s).scores[0];
  assert.equal(analyze(s).regions[0].filter(r=>r.status==='active').length,1);
  assert.equal(result.frozenCount,count);assert.equal(result.capturedTriangles,count);
  assert.equal(result.prisoners,8*count);
 }
});
