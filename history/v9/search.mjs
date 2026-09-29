import {legalActions, playLegal, score, outcome, sideToMove, MCTS_BUDGETS} from './engine.mjs';
import trainedProfile from './search-profile.json' with {type:'json'};
export const SEARCH_PROFILES={baseline:{id:'uniform-v1',candidates:1},guided4:{id:'guided4-v1',candidates:4},guided8:{id:'guided8-v1',candidates:8}};
export const DEFAULT_PROFILE=Object.freeze(trainedProfile);

// Port of crates/paisho-ai/src/rng.rs; same SplitMix64 stream and rejection rule.
export class StableRng {
  constructor(seed=1) { this.state=BigInt.asUintN(64,BigInt(seed)); }
  next() {
    this.state=BigInt.asUintN(64,this.state+0x9e3779b97f4a7c15n);
    let v=this.state;
    v=BigInt.asUintN(64,(v^(v>>30n))*0xbf58476d1ce4e5b9n);
    v=BigInt.asUintN(64,(v^(v>>27n))*0x94d049bb133111ebn);
    return v^(v>>31n);
  }
  index(n) {
    const b=BigInt(n),zone=BigInt.asUintN(64,-b)%b;
    if(n<=0) throw Error('Empty range');
    for(;;) {const v=this.next();if(v>=zone) return Number(v%b);}
  }
}
function value(state,root,terminal=false) {
  const s=score(state).scores,delta=s[root].total-s[1-root].total;
  if(terminal){const result=outcome(state);return result.winner===null?0:result.winner===root?1:-1;}
  return Math.tanh(delta/24);
}
function node(state, action=null) {return {state,action,visits:0,sum:0,children:[],untried:null};}

/** Single-tree UCT, exact simulation budget, progressive widening. Leaves use a
 * six-action seeded rollout then the new game's score (not a legacy heuristic).
 * Randomness is internal to reproducible search; the game itself has none. */
export function search(state,budget=32,seed=1,profile=DEFAULT_PROFILE) {
  const widening=profile.widening??1.5,rolloutDepth=profile.rolloutDepth??6;
  if(!Number.isFinite(widening)||widening<=0||!Number.isInteger(rolloutDepth)||rolloutDepth<0||rolloutDepth>16)throw Error('Paramètres MCTS invalides.');
  if(![1,4,8,16].includes(profile.candidates))throw Error('Profil de recherche invalide.');
  if(!MCTS_BUDGETS.includes(budget)) throw Error('Budget MCTS attendu : 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096 ou 8192.');
  const started=performance.now(),rng=new StableRng(seed),root=node(state),side=sideToMove(state);
  root.untried=legalActions(state);
  if(outcome(state,root.untried)) return {action:null,simulations:0,milliseconds:performance.now()-started};
  let nodes=1,evaluations=0,maxDepth=0;
  const evaluate=(...args)=>{evaluations++;return value(...args);};
  for(let simulation=0;simulation<budget;simulation++) {
    let current=root;
    const path=[current];
    for(;;) {
      if(current.untried===null) current.untried=legalActions(current.state);
      if(outcome(current.state,current.untried.length?current.untried:current.children.map(c=>c.action))) break;
      const width=Math.max(2,Math.ceil(widening*Math.sqrt(current.visits+1)));
      if(current.untried.length && current.children.length<width) {
        let index=rng.index(current.untried.length),nextState=null;
        if(profile.candidates>1){
          const sampled=new Set([index]);
          while(sampled.size<Math.min(profile.candidates,current.untried.length))sampled.add(rng.index(current.untried.length));
          let best=-Infinity;
          for(const candidate of sampled){const next=playLegal(current.state,current.untried[candidate]);const terminal=outcome(next);const v=evaluate(next,sideToMove(current.state),!!terminal);if(v>best){best=v;index=candidate;nextState=next;}}
        }
        const action=current.untried[index];
        current.untried[index]=current.untried.at(-1); current.untried.pop();
        const child=node(nextState??playLegal(current.state,action),action);
        current.children.push(child);current=child;path.push(child);nodes++;break;
      }
      const sign=sideToMove(current.state)===side?1:-1;
      current=current.children.reduce((best,c)=> {
        const u=sign*c.sum/c.visits+Math.SQRT2*Math.sqrt(Math.log(current.visits+1)/c.visits);
        return !best || u>best.u?{node:c,u}:best;
      },null).node;
      path.push(current);
    }
    let rollout=current.state,terminal=false;
    for(let depth=0;depth<rolloutDepth;depth++) {
      const actions=legalActions(rollout);
      if(outcome(rollout,actions)) {terminal=true;break;}
      rollout=playLegal(rollout,actions[rng.index(actions.length)]);
    }
    if(!terminal) terminal=!!outcome(rollout);
    maxDepth=Math.max(maxDepth,path.length-1);
    const result=evaluate(rollout,side,terminal);
    for(const p of path) {p.visits++;p.sum+=result;}
  }
  const best=root.children.reduce((a,b)=>!a || b.visits>a.visits || (b.visits===a.visits && b.sum/b.visits>a.sum/a.visits)?b:a,null);
  return {action:best.action,simulations:root.visits,nodes,evaluations,maxDepth,milliseconds:performance.now()-started,
    rootActions:root.children.map(c=>({action:c.action,visits:c.visits,value:c.sum/c.visits})),
    protocol:`uct-rollout6-${profile.id}`,profile,seed:String(seed)};
}
