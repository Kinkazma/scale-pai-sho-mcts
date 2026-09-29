/** Long-lived browser worker controller. Each seat/profile owns its tree and
 * sees every actual action, including human moves and reaction decisions. */
import {sideToMove} from './engine.mjs';
import {profileForBudget} from './search.mjs';
import {createSearchSession} from './search-runtime.mjs';
export class SearchController {
  constructor(profileReader=profileForBudget){this.sessions=new Map();this.profileReader=profileReader;}
  decide({state,budget,seed,history=[],profile:suppliedProfile}){
    const profile=suppliedProfile??this.profileReader(budget),id=JSON.stringify([sideToMove(state),budget,profile]);
    let entry=this.sessions.get(id);
    if(!entry||entry.history.length>history.length||entry.history.some((a,i)=>JSON.stringify(a)!==JSON.stringify(history[i])))
      entry={session:createSearchSession(profile),history:[]};
    for(let i=entry.history.length;i<history.length;i++)entry.session.advance(history[i]);
    const result=entry.session.search(state,budget,seed);
    entry.history=history.map(a=>[...a]);this.sessions.set(id,entry);return result;
  }
}
