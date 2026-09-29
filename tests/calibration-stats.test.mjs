import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../scripts/calibration-stats.mjs';
const scored=lead=>({compensation:0,result:{reason:'turn-limit',winner:lead>0?0:lead<0?1:null,scores:[{total:100+lead},{total:100}]}});
test('Jade bonus fit cannot reverse a forced defeat by rescoring it',()=>{
 const loop={compensation:0,result:{reason:'region-loop',winner:1,scores:[{total:100},{total:0}]}};
 const r=summarize([scored(-4),scored(-1),scored(2),loop]);
 assert.equal(r.forcedLoopLosses,1);assert.equal(r.suggestedCompensation,1.5);assert.equal(r.estimatedFirstScoreRate,.5);
});
test('first-player advantage produces no unrequested negative Jade bonus',()=>assert.equal(summarize([2,1,0].map(scored)).suggestedCompensation,0));
test('a mandatory bilateral-block draw remains a draw under retrospective bonus fitting',()=>{
 const draw={compensation:0,result:{reason:'both-blocked',winner:null,scores:[{total:0},{total:20}]}};
 const r=summarize([draw]);assert.equal(r.forcedDraws,1);assert.equal(r.estimatedFirstScoreRate,.5);assert.equal(r.suggestedCompensation,0);
});
test('raw margins remove the configured bonus from either camp',()=>{
 for(const side of [0,1]){const g=scored(-2);g.compensation=3;g.options={compensationSide:side};g.result.scores[side].total+=3;assert.equal(summarize([g]).rawMedianFirstLead,-2);}
});
