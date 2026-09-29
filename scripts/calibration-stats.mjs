const median=values=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
/** Retrospective score adjustment, never changes a loop defeat. Not a rerun of bonus-aware search. */
export function summarize(games){
 const wins=games.filter(g=>g.result.winner===0).length,losses=games.filter(g=>g.result.winner===1).length,draws=games.length-wins-losses;
 const scored=games.filter(g=>!['region-loop','both-blocked'].includes(g.result.reason)),forced=games.filter(g=>['region-loop','both-blocked'].includes(g.result.reason));
 const margins=scored.map(g=>g.result.scores[0].total-g.result.scores[1].total+(g.options?.compensationSide===1?1:-1)*(g.compensation??0));
 const rawMedianFirstLead=median(margins),forcedFirstWins=forced.reduce((sum,g)=>sum+(g.result.winner===null?.5:g.result.winner===0?1:0),0);
 const candidates=[...new Set([0,...margins.flatMap(d=>[-d-.5,-d,-d+.5]).filter(d=>d>=0)])].sort((a,b)=>a-b);
 const rate=k=>games.length?(forcedFirstWins+margins.reduce((n,d)=>n+(d+k>0?1:d+k===0?.5:0),0))/games.length:null;
 let suggestedCompensation=0,best=Infinity;
 for(const k of candidates){const error=Math.abs(rate(k)-.5);if(error<best-1e-12){best=error;suggestedCompensation=k;}}
 const firstScoreRate=games.length?(wins+draws/2)/games.length:null;
 return {games:games.length,firstWins:wins,secondWins:losses,draws,firstScoreRate,scoredGames:scored.length,forcedLoopLosses:forced.filter(g=>g.result.reason==='region-loop').length,forcedDraws:forced.filter(g=>g.result.reason==='both-blocked').length,rawMedianFirstLead,suggestedCompensation,estimatedFirstScoreRate:rate(suggestedCompensation)};
}
