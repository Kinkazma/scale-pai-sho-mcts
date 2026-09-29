import {legalActions,playLegal,outcome,sideToMove} from './engine.mjs';
import {evaluationRelations,tacticalPriority} from './triangle-relations.mjs';

/** Bounded, selective minimax of volatile legal sequences. Never emits a proof. */
export function tacticalContinuation(state,profile,evaluate){
  const metrics={nodes:0,maxDepth:0,maxTurns:0,maxSwitches:0,truncated:false};
  function visit(s,depth,switches,allowance){
    const actions=legalActions(s),terminal=outcome(s,actions);
    if(terminal)return evaluate(s,0,true,profile);
    const stand=evaluate(s,0,false,profile);
    if(depth>=profile.tacticalDepth)return stand;
    if(allowance<=0){metrics.truncated=true;return stand;}
    const facts=evaluationRelations(s);
    const selected=actions.map((action,index)=>({action,index,priority:tacticalPriority(s,action,facts)}))
      .filter(x=>x.priority>0).sort((a,b)=>b.priority-a.priority||a.index-b.index).slice(0,profile.tacticalWidth);
    if(!selected.length)return stand;
    let best=sideToMove(s)===0?-Infinity:Infinity,read=0;const start=metrics.nodes;
    for(let i=0;i<selected.length;i++){
      const {action}=selected[i],remaining=allowance-(metrics.nodes-start);
      if(remaining<=0||metrics.nodes>=profile.tacticalNodes){metrics.truncated=true;break;}
      metrics.nodes++;read++;
      const next=playLegal(s,action),changes=switches+Number(sideToMove(next)!==sideToMove(s));
      metrics.maxDepth=Math.max(metrics.maxDepth,depth+1);metrics.maxTurns=Math.max(metrics.maxTurns,next.ply-state.ply);
      metrics.maxSwitches=Math.max(metrics.maxSwitches,changes);
      // Share remaining work across siblings; one long branch cannot consume all replies.
      const childAllowance=Math.max(0,Math.floor(remaining/(selected.length-i))-1);
      const value=visit(next,depth+1,changes,childAllowance);best=sideToMove(s)===0?Math.max(best,value):Math.min(best,value);
    }
    // Missing quiet alternatives make this an estimate, not a forced result.
    return read?best:stand;
  }
  return {value:visit(state,0,0,profile.tacticalNodes),...metrics};
}
