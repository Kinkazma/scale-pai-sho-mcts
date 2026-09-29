/** Browser/replay facade. Historical records keep their original rules and
 * scores; live games and workers use the current engine exclusively. */
import * as current from './engine.mjs';
import * as v13 from '../history/v13/engine.mjs';
import * as v12 from '../history/v12/engine.mjs';
import * as v11 from '../history/v11/engine.mjs';
import * as v10 from '../history/v10/engine.mjs';
import * as v9 from '../history/v9/engine.mjs';
export * from './engine.mjs';
const engines=new Map([current,v13,v12,v11,v10,v9].map(engine=>[engine.RULES,engine]));
export const supportedRules=[...engines.keys()];
function engineFor(rules){
  const engine=engines.get(rules);
  if(!engine)throw Error('Journal incompatible.');
  return engine;
}
export const replay=record=>engineFor(record?.rules).replay(record);
export const analyze=state=>engineFor(state.rules).analyze(state);
export const legalActions=state=>engineFor(state.rules).legalActions(state);
export const score=state=>engineFor(state.rules).score(state);
export const outcome=(state,actions)=>engineFor(state.rules).outcome(state,actions);
export const sideToMove=state=>engineFor(state.rules).sideToMove(state);
export const cumulativeScore=state=>{
  const engine=engineFor(state.rules);
  return engine.cumulativeScore?engine.cumulativeScore(state):{turns:0,scores:engine.score(state).scores};
};
export function makeRecordForState(state,actions,agents){
  const options={hemispheres:state.hemispheres,jadeHemisphere:state.jadeHemisphere,compensationSide:state.compensationSide};
  return engineFor(state.rules).makeRecord(state.turnLimit,actions,agents,state.compensation,options);
}
