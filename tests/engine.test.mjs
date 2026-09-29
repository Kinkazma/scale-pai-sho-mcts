import test from 'node:test';
import assert from 'node:assert/strict';
import {POINTS,STOCK,pointAt as at,trianglePoints,initialState,legalActions,play,analyze,score,outcome,resolveRegions,makeRecord,replay,sideToMove,refreshDeclines} from '../src/engine.mjs';
import {StableRng,search} from '../src/search.mjs';
function fixture(tiles,selected=[[],[]],ply=0){const s=initialState();s.ply=ply;s.selected=selected.map(rs=>rs.map(v=>v.map(([x,y])=>at(x,y)).sort((a,b)=>a-b)));for(const[x,y,v]of tiles){s.board[at(x,y)]=v;s.reserve[v>0?0:1][Math.abs(v)]--;}return s;}
const A=[[0,0],[3,0],[0,2]],B=[[-1,-1],[2,-1],[-1,1]],C=[[-2,-2],[1,-2],[-2,0]],D=[[-3,-3],[0,-3],[-3,-1]];
const tiles=(v,side)=>v.map(([x,y],i)=>[x,y,(i+1)*(side===0?1:-1)]);
const has=(s,a)=>legalActions(s).some(b=>JSON.stringify(a)===JSON.stringify(b));
test('113 points, 12 tiles, no pass or swap',()=>{assert.equal(POINTS.length,113);assert.deepEqual(STOCK,[0,4,4,4]);assert.equal(legalActions(initialState()).length,339);assert.throws(()=>play(initialState(),['pass']));assert.throws(()=>play(initialState(),['swap']));assert.throws(()=>initialState(40));});
test('covered points against independent determinant enumeration including five/six',()=>{const counts=new Set();for(let a=0;a<POINTS.length;a+=5)for(let b=a+1;b<POINTS.length;b+=7)for(let c=b+1;c<POINTS.length;c+=11){const vs=[POINTS[a],POINTS[b],POINTS[c]],cross=(u,v,p)=>(v.x-u.x)*(p.y-u.y)-(v.y-u.y)*(p.x-u.x);const expected=POINTS.flatMap((p,i)=>{const ss=vs.map((u,j)=>cross(u,vs[(j+1)%3],p));return ![a,b,c].includes(i)&&cross(vs[0],vs[1],vs[2])!==0&&(ss.every(s=>s>=0)||ss.every(s=>s<=0))?[i]:[];});counts.add(expected.length);assert.deepEqual(trianglePoints(a,b,c),expected.length>=1&&expected.length<=5?expected:null);}assert.ok(counts.has(5)&&counts.has(6));});
test('exact distances, diagonals, intermediate obstruction',()=>{const s=fixture([[0,0,2]]);assert.ok(has(s,[at(0,0),at(2,0)]));assert.ok(has(s,[at(0,0),at(2,2)]));for(const p of [[1,0],[3,0],[1,1]])assert.ok(!has(s,[at(0,0),at(...p)]));assert.ok(!has(fixture([[0,0,2],[1,0,-1]]),[at(0,0),at(2,0)]));});
test('continuous crossing allowed without forbidden sampled intersection; own region passable',()=>{const v=[[0,0],[3,1],[1,2]];const s=fixture([...tiles(v,0),[0,1,-1]],[[v],[]],1);assert.ok(has(s,[at(0,1),at(1,0)]));assert.ok(!has(s,[at(0,1),at(1,1)]));const own=fixture([...tiles(v,0),[0,1,1]],[[v],[]]);assert.ok(has(own,[at(0,1),at(1,1)]));});
test('unchosen triangles have no effect; declared ones immobilize without capture',()=>{assert.equal(analyze(fixture([...tiles(A,0),[1,1,-1]])).frozen.size,0);const s=fixture([...tiles(A,0),[1,1,-1]],[[A],[]],1);assert.ok(analyze(s).frozen.has(at(1,1)));assert.ok(!legalActions(s).some(a=>a[0]===at(1,1)));assert.equal(s.board[at(1,1)],-1);assert.equal(score(s).scores[0].prisoners,4);assert.equal(score(s).scores[0].regions,0);});
test('geometric inhibition chain reactivates the original region',()=>{const ab=fixture([...tiles(A,0),...tiles(B,1)],[[A],[B]]);assert.equal(analyze(ab).regions[0][0].status,'suspended');const abc=fixture([...tiles(A,0),...tiles(B,1),...tiles(C,0)],[[A,C],[B]]);assert.ok(analyze(abc).regions[0].every(r=>r.status==='active'));assert.equal(analyze(abc).regions[1][0].status,'suspended');const abcd=fixture([...tiles(A,0),...tiles(B,1),...tiles(C,0),...tiles(D,1)],[[A,C],[B,D]]);assert.ok(analyze(abcd).regions[0].every(r=>r.status==='suspended'));assert.ok(analyze(abcd).regions[1].every(r=>r.status==='active'));});
function graph(sides,edges){const rs=sides.map((side,i)=>({side,vertices:[i],inside:edges.filter(([f])=>f===i).map(([,t])=>t)}));return resolveRegions([rs.filter(r=>r.side===0),rs.filter(r=>r.side===1)]).flat().sort((a,b)=>a.vertices[0]-b.vertices[0]);}
test('unresolved cyclic fixtures require history; an external attacker resolves the cycle',()=>{assert.throws(()=>graph([0,1,0],[[0,1],[1,0],[1,2]]),/Historique/);const r=graph([0,1,1],[[0,1],[1,0],[2,0]]);assert.deepEqual(r.map(r=>r.status),['suspended','active','active']);assert.ok(r.every(r=>!r.cyclic));});
function opening(){let s=initialState();for(const a of [[-1,at(0,0)],['end-turn'],[-1,at(-5,0)],['end-turn'],[-2,at(3,0)],['end-turn'],[-2,at(-4,0)],['end-turn'],[-3,at(0,2)]])s=play(s,a);return s;}
test('single candidate optional; region decisions do not consume turns',()=>{const s=opening();assert.equal(s.ply,4);assert.equal(sideToMove(s),0);assert.deepEqual(legalActions(s).map(a=>a[0]),['region','decline']);const yes=play(s,legalActions(s)[0]);assert.equal(yes.ply,4);assert.equal(analyze(yes).regions[0].length,1);const no=play(s,['decline']);assert.equal(no.ply,4);assert.equal(no.selected[0].length,0);assert.equal(no.declined[0].length,1);assert.equal(sideToMove(no),0);});
test('refusal survives unrelated pose but clears when vertex moves',()=>{let s=play(play(opening(),['decline']),['end-turn']);s=play(s,[-1,at(-3,0)]);s=play(s,['end-turn']);assert.equal(s.resolution,null);assert.equal(s.declined[0].length,1);s=play(s,[at(0,0),at(1,0)]);assert.equal(s.declined[0].length,0);});
test('freeing a vertex lifts a refusal without moving the vertex',()=>{const before=fixture([...tiles(A,0),...tiles(B,1)],[[A],[B]]);before.declined[0]=[A.map(p=>at(...p))];const after=fixture([...tiles(A,0),...tiles(B,1),...tiles(C,0)],[[A,C],[B]]);after.declined=before.declined;assert.ok(analyze(before).frozen.has(at(0,0)));assert.ok(!analyze(after).frozen.has(at(0,0)));assert.equal(refreshDeclines(before,after).declined[0].length,0);});
test('last board turn resolves region choices before final scoring',()=>{const s={...opening(),ply:59,movesThisTurn:1};assert.equal(outcome(s),null);assert.equal(outcome(play(s,['decline'])).reason,'turn-limit');});
test('influence ties neutral; no-legal-action ends without pass',()=>{const s=fixture([[-2,0,1],[2,0,-1]]),sc=score(s);assert.equal(sc.scores[0].influence,sc.scores[1].influence);assert.equal(sc.influence[at(0,0)],-1);const empty=initialState();empty.reserve=[[0,0,0,0],[0,0,0,0]];assert.equal(outcome(empty).reason,'both-blocked');});
test('Rust-compatible RNG, exact and deterministic MCTS budgets',()=>{assert.equal(new StableRng(0).next(),0xe220a8397b1dcdafn);for(const n of [8,16,32,64,128,256,512]){const s=initialState(),a=search(s,n,42),b=search(s,n,42);assert.equal(a.simulations,n);assert.deepEqual(a.action,b.action);assert.deepEqual(a.rootActions,b.rootActions);assert.ok(has(s,a.action));assert.equal(a.rootActions.reduce((n,c)=>n+c.visits,0),n);assert.ok(has(opening(),search(opening(),n,3).action));}});
test('records include declarations/refusals and reject illegal moves or false scores',()=>{const actions=[[-1,at(0,0)],['end-turn'],[-1,at(-5,0)],['end-turn'],[-2,at(3,0)],['end-turn'],[-2,at(-4,0)],['end-turn'],[-3,at(0,2)],['decline']];const r=makeRecord(30,actions);assert.equal(replay(r).at(-1).declined[0].length,1);assert.throws(()=>replay({...r,result:{winner:0}}));assert.throws(()=>replay({...r,rules:'old-game'}));assert.throws(()=>replay({...r,actions:[[-1,999]]}));});
test('edge points count toward five-point cap, excluding defining vertices',()=>{
 const points=trianglePoints(at(0,0),at(6,0),at(0,1));
 assert.deepEqual(points,[1,2,3,4,5].map(x=>at(x,0)));
 assert.equal(trianglePoints(at(0,0),at(4,0),at(0,2)),null); // Five edge points plus one interior.
 assert.equal(trianglePoints(at(-6,0),at(6,0),at(0,1)),null); // Long thin triangle: eleven edge points.
 const s=fixture([[0,0,1],[4,0,2],[0,2,3]]);
 assert.equal(analyze(s).candidates[0].length,0);
});
test('edge points freeze enemies, forbid placement and movement, and score once',()=>{
 const s=fixture([...tiles(A,0),[1,0,-1],[-1,1,-2]],[[A],[]],1);
 assert.ok(analyze(s).frozen.has(at(1,0)));
 assert.ok(!has(s,[-1,at(2,0)]));
 assert.ok(!has(s,[at(-1,1),at(1,1)])); // Intermediate point (0,1) lies on an edge.
 assert.equal(score(s).scores[0].prisoners,4);
 assert.equal(score(s).scores[0].regions,0);
 assert.ok(A.every(p=>!analyze(s).territory[0].has(at(...p))));
});
