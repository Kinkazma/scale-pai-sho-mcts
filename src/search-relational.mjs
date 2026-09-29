/** Opt-in relational search. The retained-v1 implementation and profiles stay intact. */
import {RULES,MCTS_BUDGETS,playLegal,sideToMove} from './engine.mjs';
import {RetainedSearch,RETAINED_SEARCH,refreshProof,recommend} from './search-memory.mjs';
import {RELATIONAL_SEARCH,relationalProfile} from './relational-profile.mjs';
import {evaluationRelations,tacticalPriority} from './triangle-relations.mjs';
import {tacticalContinuation} from './tactical-continuation.mjs';
const node=(state,action=null)=>({state,action,visits:0,sum:0,children:[],prepared:new Map(),actions:null,untried:null,terminal:null,proof:undefined,leaf:undefined});
const proofValue=winner=>winner===null?0:winner===0?1:-1;
function estimate(n,solver){
  if(solver&&n.proof!==undefined)return proofValue(n.proof);
  const value=n.visits?n.sum/n.visits:n.leaf??0;
  if(solver&&[...n.prepared.values()].some(c=>c.proof===null))return sideToMove(n.state)===0?Math.max(0,value):Math.min(0,value);
  return value;
}
export class RelationalSearch extends RetainedSearch {
  constructor(profile,deps){
    const p=relationalProfile(profile);
    super({...p,searchVersion:RETAINED_SEARCH,rolloutDepth:Math.min(p.rolloutDepth,16)},deps);this.profile=p;
  }
  search(state,budget,seed){
    if(state.rules!==RULES)throw Error('Recherche incompatible avec ce règlement.');
    if(!MCTS_BUDGETS.includes(budget))throw Error('Invalid MCTS budget');
    const started=performance.now(),p=this.profile,rng=new this.Rng(seed);
    // Exact complete-state comparison, deliberately not a board-only cache key.
    if(!p.reuseTree||!this.root||JSON.stringify(this.root.state)!==JSON.stringify(state))this.root=node(state);
    const root=this.root;this.ensure(root);
    this.metrics={evaluations:0,cachedSuccessors:0,cachedValues:0,appliedActions:0,tacticalNodes:0,maxTacticalDepth:0,maxTacticalTurns:0,maxTacticalSwitches:0,tacticalTruncations:0,maxTurns:0,maxSwitches:0,maxRolloutDepth:0};
    const inheritedVisits=root.visits,chooser=sideToMove(state);
    let simulations=0,maxDepth=0;
    if(!root.terminal)for(;simulations<budget;simulations++){
      if(p.solver&&root.proof!==undefined)break;
      let current=root;const path=[root];
      for(;;){
        this.ensure(current);
        if(current.terminal||(p.solver&&current.proof!==undefined))break;
        const unknown=current.children.filter(c=>!p.solver||c.proof===undefined);
        const width=Math.max(2,Math.ceil(p.widening*Math.sqrt(current.visits+1)));
        if(current.untried.length&&(current.children.length<width||!unknown.length)){
          let index=rng.index(current.untried.length),best=-Infinity,chosen=null;
          const sampled=new Set([index]);
          if(p.tacticalOrdering){
            const facts=evaluationRelations(current.state);
            const ranked=current.untried.map((a,i)=>({i,v:tacticalPriority(current.state,a,facts)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v||a.i-b.i);
            if(ranked.length){if(p.candidates===1)sampled.clear();sampled.add(ranked[0].i);}
          }
          while(sampled.size<Math.min(p.candidates,current.untried.length))sampled.add(rng.index(current.untried.length));
          const sign=sideToMove(current.state)===0?1:-1;
          for(const i of sampled){
            const c=this.prepare(current,current.untried[i]),value=sign*this.leaf(c);
            // Proofs outrank even a saturated heuristic value.
            const rank=p.solver&&c.proof===sideToMove(current.state)?2:0;
            const bestRank=chosen&&p.solver&&chosen.proof===sideToMove(current.state)?2:0;
            if(!chosen||rank>bestRank||(rank===bestRank&&value>best)){index=i;best=value;chosen=c;}
          }
          current.untried[index]=current.untried.at(-1);current.untried.pop();
          current.children.push(chosen);current=chosen;path.push(current);break;
        }
        const choices=unknown.length?unknown:current.children,sign=sideToMove(current.state)===0?1:-1;
        current=choices.reduce((best,c)=>{
          const u=sign*estimate(c,p.solver)+p.exploration*Math.sqrt(Math.log(current.visits+1)/c.visits);
          return !best||u>best.u?{node:c,u}:best;
        },null).node;
        path.push(current);
      }
      let rollout=current,rolloutActions=0;
      for(let depth=0;depth<p.rolloutDepth;depth++){
        this.ensure(rollout);
        if(rollout.terminal||(p.solver&&rollout.proof!==undefined))break;
        rollout=node(playLegal(rollout.state,rollout.actions[rng.index(rollout.actions.length)]));this.metrics.appliedActions++;rolloutActions++;
      }
      let value=p.solver&&rollout.proof!==undefined?proofValue(rollout.proof):this.leaf(rollout);
      if(p.tacticalDepth>0&&p.tacticalNodes>this.metrics.tacticalNodes&&rollout.proof===undefined){
        const result=tacticalContinuation(rollout.state,{...p,tacticalNodes:p.tacticalNodes-this.metrics.tacticalNodes},(...args)=>{this.metrics.evaluations++;return this.evaluate(...args);});
        value=result.value;this.metrics.tacticalNodes+=result.nodes;this.metrics.appliedActions+=result.nodes;
        this.metrics.maxTacticalDepth=Math.max(this.metrics.maxTacticalDepth,result.maxDepth);
        this.metrics.maxTacticalTurns=Math.max(this.metrics.maxTacticalTurns,result.maxTurns);
        this.metrics.maxTacticalSwitches=Math.max(this.metrics.maxTacticalSwitches,result.maxSwitches);
        this.metrics.tacticalTruncations+=Number(result.truncated);
      }
      this.metrics.maxRolloutDepth=Math.max(this.metrics.maxRolloutDepth,rolloutActions);
      this.metrics.maxTurns=Math.max(this.metrics.maxTurns,current.state.ply-root.state.ply);
      let switches=0;for(let i=1;i<path.length;i++)switches+=Number(sideToMove(path[i].state)!==sideToMove(path[i-1].state));
      this.metrics.maxSwitches=Math.max(this.metrics.maxSwitches,switches);
      maxDepth=Math.max(maxDepth,path.length-1);
      for(let i=path.length-1;i>=0;i--){const n=path[i];n.visits++;n.sum+=value;if(p.solver)refreshProof(n);}
    }
    const candidates=[...root.prepared.values()].filter(c=>c.visits>0||(p.solver&&c.proof!==undefined));
    const best=root.terminal?null:recommend(candidates,chooser,p.solver),sign=chooser===0?1:-1;
    let retainedNodes=0;const stack=[root];
    while(stack.length&&retainedNodes<=p.maxNodes){const n=stack.pop();retainedNodes++;stack.push(...n.prepared.values());}
    const memoryReset=retainedNodes>p.maxNodes;
    if(memoryReset)this.clear();
    return {action:best?.action??null,simulations,requestedSimulations:budget,inheritedVisits,rootVisits:root.visits,
      nodes:this.metrics.appliedActions+1,...this.metrics,maxDepth,retainedNodes,memoryReset,
      proof:root.proof===undefined?'unknown':root.proof===null?'draw':root.proof,
      rootActions:candidates.map(c=>({action:c.action,visits:c.visits,value:sign*estimate(c,p.solver),proof:c.proof===undefined?'unknown':c.proof===null?'draw':c.proof})),
      milliseconds:performance.now()-started,protocol:`regions-v14-${RELATIONAL_SEARCH}`,profile:p,seed:String(seed)};
  }
}
