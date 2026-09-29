import {initialState,sideToMove,playLegal,outcome,makeRecord,replay} from '../src/engine.mjs';
import {createSearchSession} from '../src/search.mjs';

export function playMatch(job){
  const profiles=job.profiles,agents={players:[String(job.budget),String(job.budget)],profiles,seed:String(job.seed)};
  const sessions=profiles.map(createSearchSession),actions=[];
  let state=initialState(job.limit,0,job.options);
  const statistics={seconds:0,searchSeconds:[0,0],simulations:[0,0],inheritedVisits:[0,0],cachedSuccessors:[0,0],cachedValues:[0,0],decisions:[0,0],proofs:[0,0]};
  const started=performance.now();
  while(!outcome(state)){
    const side=sideToMove(state),decision=sessions[side].search(state,job.budget,BigInt(job.seed)+BigInt(actions.length)*1000003n);
    if(!decision.action||decision.simulations>job.budget)throw Error('Invalid nonterminal search result');
    statistics.searchSeconds[side]+=decision.milliseconds/1000;
    for(const k of ['simulations','inheritedVisits','cachedSuccessors','cachedValues'])statistics[k][side]+=decision[k]??0;
    statistics.decisions[side]++;
    if(decision.proof!==undefined&&decision.proof!=='unknown')statistics.proofs[side]++;
    state=playLegal(state,decision.action);actions.push(decision.action);
    for(const session of sessions)session.advance(decision.action);
    if(actions.length>5000)throw Error('Operational decision guard; no game result assigned');
  }
  statistics.seconds=(performance.now()-started)/1000;
  const record={...makeRecord(job.limit,actions,agents,0,job.options),statistics};
  if(JSON.stringify(replay(record).at(-1))!==JSON.stringify(state))throw Error('Replay mismatch');
  return record;
}
