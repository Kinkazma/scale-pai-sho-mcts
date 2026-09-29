import {initialState,sideToMove,playLegal,outcome,makeRecord,replay} from '../src/engine.mjs';
import {createSearchSession} from '../src/search-runtime.mjs';

export function playMatch(job){
  const profiles=job.profiles,agents={players:[String(job.budget),String(job.budget)],profiles,seed:String(job.seed)};
  const sessions=profiles.map(createSearchSession),actions=[];
  let state=initialState(job.limit,0,job.options);
  const statistics={seconds:0,searchSeconds:[0,0],simulations:[0,0],inheritedVisits:[0,0],cachedSuccessors:[0,0],cachedValues:[0,0],decisions:[0,0],proofs:[0,0],depthHistograms:[{},{}],turnDepthHistograms:[{},{}],switchDepthHistograms:[{},{}],rolloutDepthHistograms:[{},{}],tacticalDepthHistograms:[{},{}],tacticalNodes:[0,0]};
  if(profiles.some(p=>p.repetitionPolicy))statistics.repetition={avoided:[0,0],forced:[0,0],blockedCandidates:[0,0],seconds:[0,0]};
  const started=performance.now();
  while(!outcome(state)){
    const side=sideToMove(state),decision=sessions[side].search(state,job.budget,BigInt(job.seed)+BigInt(actions.length)*1000003n);
    if(!decision.action||decision.simulations>job.budget)throw Error('Invalid nonterminal search result');
    statistics.searchSeconds[side]+=decision.milliseconds/1000;
    for(const k of ['simulations','inheritedVisits','cachedSuccessors','cachedValues'])statistics[k][side]+=decision[k]??0;
    statistics.decisions[side]++;
    for(const [field,key]of [['depthHistograms','maxDepth'],['turnDepthHistograms','maxTurns'],['switchDepthHistograms','maxSwitches'],['rolloutDepthHistograms','maxRolloutDepth'],['tacticalDepthHistograms','maxTacticalDepth']]){
      const depth=decision[key];if(depth!==undefined)statistics[field][side][depth]=(statistics[field][side][depth]??0)+1;
    }
    statistics.tacticalNodes[side]+=decision.tacticalNodes??0;
    if(statistics.repetition&&decision.repetitionGuard){
      statistics.repetition.avoided[side]+=Number(decision.repetitionGuard.avoided);
      statistics.repetition.forced[side]+=Number(decision.repetitionGuard.forced);
      statistics.repetition.blockedCandidates[side]+=decision.repetitionGuard.blockedCandidates;
      statistics.repetition.seconds[side]+=decision.repetitionGuard.milliseconds/1000;
    }
    if(decision.proof!==undefined&&decision.proof!=='unknown')statistics.proofs[side]++;
    state=playLegal(state,decision.action);actions.push(decision.action);
    for(const session of sessions)session.advance(decision.action,state);
    if(actions.length>5000)throw Error('Operational decision guard; no game result assigned');
  }
  // The final advance of either side may have no subsequent search to bill it to.
  sessions.forEach((session,side)=>{const extra=(session.drainOverheadMilliseconds?.()??0)/1000;
    statistics.searchSeconds[side]+=extra;if(statistics.repetition)statistics.repetition.seconds[side]+=extra;});
  statistics.seconds=(performance.now()-started)/1000;
  const record={...makeRecord(job.limit,actions,agents,0,job.options),statistics};
  if(JSON.stringify(replay(record).at(-1))!==JSON.stringify(state))throw Error('Replay mismatch');
  return record;
}
