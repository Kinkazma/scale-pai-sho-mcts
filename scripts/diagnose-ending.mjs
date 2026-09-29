import fs from 'node:fs';
import path from 'node:path';
import {replay,score,analyze} from '../src/engine.mjs';
const input=process.argv[2];
const baseline=JSON.parse(fs.readFileSync(path.join(input,'baseline.json'),'utf8'));
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const median=a=>{const s=[...a].sort((x,y)=>x-y),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
const describe=a=>({mean:mean(a),median:median(a),min:Math.min(...a),max:Math.max(...a)});
const delta=s=>{const p=score(s).scores;return p[0].total-p[1].total;};
const samples=baseline.games.map(g=>{
 const r=JSON.parse(fs.readFileSync(path.join(input,g.file),'utf8')),states=replay(r),byPly=new Map(states.filter(s=>!s.resolution&&s.movesThisTurn===0).map(s=>[s.ply,s]));
 const total=2*g.limit,before=byPly.get(total-2),afterJade=byPly.get(total-1),final=byPly.get(total);
 const raw=[delta(before),delta(afterJade),delta(final)];
 const firstEnd=raw[1]>0?1:raw[1]<0?0:.5,secondEnd=raw[2]>0?1:raw[2]<0?0:.5;
 const turnChanges=[];
 for(let ply=1;ply<=total;ply++)if(byPly.has(ply-1)&&byPly.has(ply))turnChanges.push({ply,side:(ply-1)%2,gain:(delta(byPly.get(ply))-delta(byPly.get(ply-1)))*(ply%2?1:-1)});
 return {id:g.id,budget:g.budget,limit:g.limit,raw,firstEnd,secondEnd,jadeFinalGain:raw[1]-raw[0],ambreFinalGain:raw[1]-raw[2],turnChanges,
  beforeCounts:score(before).scores,afterJadeCounts:score(afterJade).scores,finalCounts:score(final).scores,
  checkpoints:[.25,.5,.75,1].map(f=>({fraction:f,rawLead:delta(byPly.get(2*Math.max(1,Math.floor(g.limit*f))))}))};
});
function summarize(gs){return {games:gs.length,beforeFinalRound:describe(gs.map(g=>g.raw[0])),afterJadeFinal:describe(gs.map(g=>g.raw[1])),afterAmbreFinal:describe(gs.map(g=>g.raw[2])),jadeFinalGain:describe(gs.map(g=>g.jadeFinalGain)),ambreFinalGain:describe(gs.map(g=>g.ambreFinalGain)),firstRateBeforeLastTurn:mean(gs.map(g=>g.firstEnd)),firstRateAtEnd:mean(gs.map(g=>g.secondEnd)),changedOutcomeInLastTurn:gs.filter(g=>g.firstEnd!==g.secondEnd).length,
 checkpoints:[0,1,2,3].map(i=>({fraction:gs[0].checkpoints[i].fraction,lead:describe(gs.map(g=>g.checkpoints[i].rawLead))})),
 lateNonfinalGains:[0,1].map(side=>describe(gs.flatMap(g=>g.turnChanges.filter(t=>t.side===side&&t.ply>2*g.limit-12&&t.ply<=2*g.limit-2).map(t=>t.gain))))};}
const report={warning:'Retrospective diagnosis, not a counterfactual replay with another known stopping rule.',summary:summarize(samples),byBudget:[8,32,128].map(b=>({budget:b,...summarize(samples.filter(g=>g.budget===b))})),samples};
fs.writeFileSync(path.join(input,'ending-diagnosis.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,byBudget:report.byBudget},null,2));
