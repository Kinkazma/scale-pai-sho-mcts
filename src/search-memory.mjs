/** Per-game tree and successor reuse, with exact terminal minimax proofs.
 * Values use Jade's fixed perspective; decision ownership comes from the rules.
 * No state merging: cumulative scores, quotas and regional history stay intact. */
import {RULES,MCTS_BUDGETS,legalActions,playLegal,outcome,sideToMove} from './engine.mjs';

export const RETAINED_SEARCH='retained-solver-v1';
export function retainedProfile(profile){
  const p={candidates:8,widening:1.5,rolloutDepth:0,exploration:Math.SQRT2,
    horizonWeight:1,scoreScale:24,reuseTree:true,solver:true,cacheCandidates:true,maxNodes:50000,...profile};
  if(p.searchVersion!==RETAINED_SEARCH)throw Error('Unknown search version');
  if(![1,4,8,16].includes(p.candidates)||!Number.isInteger(p.rolloutDepth)||p.rolloutDepth<0||p.rolloutDepth>16)throw Error('Invalid search profile');
  for(const [key,lo,hi]of [['widening',.25,16],['exploration',.05,8],['horizonWeight',0,4],['scoreScale',1,128],['maxNodes',100,1000000]])
    if(!Number.isFinite(p[key])||p[key]<lo||p[key]>hi)throw Error(`Invalid ${key}`);
  if(!Number.isInteger(p.maxNodes))throw Error('Invalid maxNodes');
  for(const k of ['reuseTree','solver','cacheCandidates'])if(typeof p[k]!=='boolean')throw Error(`Invalid ${k}`);
  return Object.freeze(p);
}
const key=a=>JSON.stringify(a);
const node=(state,action=null)=>({state,action,visits:0,sum:0,children:[],prepared:new Map(),actions:null,untried:null,terminal:null,proof:undefined,leaf:undefined});
const proofValue=winner=>winner===null?0:winner===0?1:-1;

/** undefined = unknown, null = proved draw, 0/1 = absolute proved winner. */
export function refreshProof(n){
  if(n.proof!==undefined||n.actions===null)return;
  const chooser=sideToMove(n.state),known=[...n.prepared.values()];
  if(known.some(c=>c.proof===chooser))n.proof=chooser;
  else if(n.actions.length>0&&known.length===n.actions.length&&known.every(c=>c.proof!==undefined))
    n.proof=known.some(c=>c.proof===null)?null:1-chooser;
}
function estimate(n,solver){
  if(solver&&n.proof!==undefined)return proofValue(n.proof);
  const value=n.visits?n.sum/n.visits:n.leaf??0;
  if(solver&&[...n.prepared.values()].some(c=>c.proof===null))
    return sideToMove(n.state)===0?Math.max(0,value):Math.min(0,value);
  return value;
}
export function recommend(children,chooser,solver){
  const sign=chooser===0?1:-1;
  let eligible=children;
  if(solver){
    const wins=children.filter(c=>c.proof===chooser);
    if(wins.length)eligible=wins;
    else {
      const alternatives=children.filter(c=>c.proof!==1-chooser);
      if(alternatives.length)eligible=alternatives;
      const draws=eligible.filter(c=>c.proof===null);
      if(draws.length)eligible=eligible.filter(c=>c.proof===null||(c.proof===undefined&&c.visits>0&&sign*estimate(c,true)>0));
    }
  }
  return eligible.reduce((a,b)=>!a||b.visits>a.visits||(b.visits===a.visits&&sign*estimate(b,solver)>sign*estimate(a,solver))?b:a,null);
}

export class RetainedSearch {
  constructor(profile,{Rng,evaluate}){
    this.profile=retainedProfile(profile);this.Rng=Rng;this.evaluate=evaluate;this.root=null;
  }
  clear(){this.root=null;}
  advance(action){
    if(!this.profile.reuseTree){this.clear();return false;}
    const child=this.root?.prepared.get(key(action));this.root=child??null;return !!child;
  }
  ensure(n){
    if(n.actions!==null)return;
    n.actions=legalActions(n.state);n.untried=[...n.actions];n.terminal=outcome(n.state,n.actions);
    if(n.terminal)n.proof=n.terminal.winner;
  }
  leaf(n){
    if(this.profile.cacheCandidates&&n.leaf!==undefined){this.metrics.cachedValues++;return n.leaf;}
    this.ensure(n);this.metrics.evaluations++;
    n.leaf=n.terminal?proofValue(n.terminal.winner):this.evaluate(n.state,0,false,this.profile);
    return n.leaf;
  }
  prepare(n,action){
    const id=key(action),cached=n.prepared.get(id);
    if(cached){
      this.metrics.cachedSuccessors++;
      if(!this.profile.cacheCandidates){cached.state=playLegal(n.state,action);cached.leaf=undefined;this.metrics.appliedActions++;}
      return cached;
    }
    const child=node(playLegal(n.state,action),action);this.metrics.appliedActions++;
    n.prepared.set(id,child);this.ensure(child);return child;
  }
  search(state,budget,seed){
    if(state.rules!==RULES)throw Error('Recherche incompatible avec ce règlement.');
    if(!MCTS_BUDGETS.includes(budget))throw Error('Invalid MCTS budget');
    const started=performance.now(),p=this.profile,rng=new this.Rng(seed);
    // Exact complete-state comparison, deliberately not a board-only cache key.
    if(!p.reuseTree||!this.root||JSON.stringify(this.root.state)!==JSON.stringify(state))this.root=node(state);
    const root=this.root;this.ensure(root);
    this.metrics={evaluations:0,cachedSuccessors:0,cachedValues:0,appliedActions:0};
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
      let rollout=current;
      for(let depth=0;depth<p.rolloutDepth;depth++){
        this.ensure(rollout);
        if(rollout.terminal||(p.solver&&rollout.proof!==undefined))break;
        rollout=node(playLegal(rollout.state,rollout.actions[rng.index(rollout.actions.length)]));this.metrics.appliedActions++;
      }
      const value=p.solver&&rollout.proof!==undefined?proofValue(rollout.proof):this.leaf(rollout);
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
      milliseconds:performance.now()-started,protocol:`regions-v14-${RETAINED_SEARCH}`,profile:p,seed:String(seed)};
  }
}
