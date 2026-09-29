/** One-sided mixture e-process on COMPLETE, preordered reversed-seat pairs.
 * Under E[X_t | past] <= 1/2 each factor has conditional expectation <= 1.
 * Fixed nonnegative bets and mixture weights give Ville's anytime guarantee. */
import crypto from 'node:crypto';
export const METHOD='paired-betting-mixture-v1';
export const BETS=Object.freeze([.125,.25,.5,.75,1,1.25,1.5,1.75]);
export const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
export const weights=p=>Object.fromEntries(Object.entries(p).filter(([k])=>k!=='id'));
export function evidence(scores,alpha){
 if(!(alpha>0&&alpha<1)||scores.some(x=>![0,.25,.5,.75,1].includes(x)))throw Error('Invalid paired evidence');
 const logs=BETS.map(b=>scores.reduce((s,x)=>s+Math.log1p(b*(x-.5)),0)),top=Math.max(...logs);
 const logE=top+Math.log(logs.reduce((s,x)=>s+Math.exp(x-top),0)/logs.length);
 return {pairs:scores.length,scoreRate:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,logE,logThreshold:-Math.log(alpha),passed:logE>=-Math.log(alpha)};
}
export function pairFacts(games){
 if(games.length!==2||games[0].pair!==games[1].pair||games[0].candidateSide!==0||games[1].candidateSide!==1)throw Error('Ordered complete pair required');
 const costs=[0,0];let points=0,wins=0,draws=0,losses=0;
 for(const g of games){
  if(!g.result||![null,0,1].includes(g.result.winner)||!g.statistics?.searchSeconds?.every(x=>Number.isFinite(x)&&x>=0))throw Error('Invalid result/cost');
  const score=g.result.winner===null?.5:g.result.winner===g.candidateSide?1:0;
  points+=score;wins+=score===1;draws+=score===.5;losses+=score===0;
  costs[0]+=g.statistics.searchSeconds[g.candidateSide];costs[1]+=g.statistics.searchSeconds[1-g.candidateSide];
 }
 return {score:points/2,candidateSeconds:costs[0],opponentSeconds:costs[1],wins,draws,losses};
}
export function decision(d,policy){
 const e=evidence(d.pairs.map(p=>p.score),d.alpha),sum=k=>d.pairs.reduce((s,p)=>s+p[k],0);
 const candidateSeconds=sum('candidateSeconds'),opponentSeconds=sum('opponentSeconds'),costRatio=opponentSeconds?candidateSeconds/opponentSeconds:null;
 const enough=e.pairs>=policy.minPairs;let state='pending';
 if(enough&&e.passed)state=costRatio!==null&&costRatio<=policy.maxCostRatio?'accepted':'cost-rejected';
 else if(enough&&e.scoreRate<=policy.futilityScore)state='not-promising';
 else if(e.pairs>=policy.maxPairs)state='inconclusive';
 return {...e,alpha:d.alpha,state,eligible:state==='accepted',costRatio,candidateSeconds,opponentSeconds,wins:sum('wins'),draws:sum('draws'),losses:sum('losses'),games:2*e.pairs};
}
export function policyOptions(p){
 const v={method:METHOD,batchPairs:8,maxPairs:128,minPairs:16,futilityScore:.45,maxCostRatio:1.25,maxSearchShare:.15,maxGameShare:.10,...p};
 if(v.method!==METHOD||![v.batchPairs,v.maxPairs,v.minPairs].every(Number.isInteger)||v.batchPairs<1||v.batchPairs>8||v.minPairs<1||v.maxPairs<v.minPairs||v.maxPairs>128||!(v.futilityScore>=0&&v.futilityScore<.5)||!(v.maxSearchShare>0&&v.maxSearchShare<=.15)||!(v.maxGameShare>0&&v.maxGameShare<=.10)||v.maxCostRatio!==1.25)throw Error('Invalid sequential policy');
 return v;
}
