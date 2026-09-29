import {referenceIdentity,referenceHash} from './reference-pool.mjs';
/** Allocation only: selection results never enter confirmatory evidence. */
import {hash,weights,decision,pairFacts} from './sequential-evidence.mjs';
export function evidenceSources(plan){
 return Object.fromEntries(Object.entries(plan.sources).filter(([p])=>p.startsWith('src/')||p.endsWith('evolution-relational-game.mjs')||p.endsWith('sequential-evidence.mjs')||p.endsWith('reference-pool.mjs')));
}
export function hypothesis(plan,budget,profile){return hash({rules:plan.rules,budget,limits:plan.config.limits,profile:weights(profile),reference:referenceIdentity(plan,budget),sources:evidenceSources(plan)});}
export function rotationOptions(p){
 const v={version:1,gracePairs:32,weakScore:.55,revisitAfter:4,minSelectionLots:2,windowLots:6,...p};
 if(v.version!==1||![v.gracePairs,v.revisitAfter,v.minSelectionLots,v.windowLots].every(Number.isInteger)||v.gracePairs<16||v.gracePairs>64||v.revisitAfter<1||v.revisitAfter>16||v.minSelectionLots<2||v.windowLots<v.minSelectionLots||v.windowLots>16||v.weakScore<.5||v.weakScore>.6)throw Error('Invalid rotation policy');
 return v;
}
export function observeSelection(s,plan,budget,games,output){
 const ref=referenceHash(plan,budget),r=rotationOptions(s.policy.rotation);
 if(!s.rotation||s.rotation.referenceHash!==ref)s.rotation={referenceHash:ref,servedLots:0,lastRevisitLot:0,lots:[]};
 const byGeneration=new Map();
 for(let i=0;i<games.length;i+=2){
  const pair=games.slice(i,i+2),f=pairFacts(pair),g=pair[0],profile=g.profiles?.[g.candidateSide];
  if(!profile)throw Error('Selection profile required for rotation');
  const key=hypothesis(plan,budget,profile),group=byGeneration.get(g.generation)??new Map(),row=group.get(key)??{key,profile,points:0,pairs:0,candidateSeconds:0,opponentSeconds:0};
  row.points+=f.score;row.pairs++;row.candidateSeconds+=f.candidateSeconds;row.opponentSeconds+=f.opponentSeconds;group.set(key,row);byGeneration.set(g.generation,group);
 }
 for(const [generation,rows] of byGeneration){
  const id=output+':'+generation;if(s.rotation.lots.some(l=>l.id===id))continue;
  const entries=[...rows.values()].sort((a,b)=>b.points/b.pairs-a.points/a.pairs||a.key.localeCompare(b.key));
  s.rotation.lots.push({id,entries:entries.map((e,i)=>({...e,top:i<2}))});
 }
 s.rotation.lots=s.rotation.lots.slice(-r.windowLots);
}
export function rotationChoice(s,plan,budget){
 const r=rotationOptions(s.policy.rotation),tick=s.rotation.servedLots,ref=referenceHash(plan,budget);
 const dossiers=Object.values(s.dossiers).filter(d=>d.referenceHash===ref&&d.state==='pending');
 const weak=d=>{const v=decision(d,s.policy);return d.pairs.length>=r.gracePairs&&(v.scoreRate<=r.weakScore||v.costRatio===null||v.costRatio>s.policy.maxCostRatio);};
 const totals=new Map();
 for(const lot of s.rotation.lots)for(const e of lot.entries){const t=totals.get(e.key)??{key:e.key,profile:e.profile,top:0,points:0,pairs:0,candidateSeconds:0,opponentSeconds:0};for(const k of ['points','pairs','candidateSeconds','opponentSeconds'])t[k]+=e[k];t.top+=e.top?1:0;totals.set(e.key,t);}
 const candidates=[...totals.values()].filter(x=>x.top>=r.minSelectionLots&&hash(weights(x.profile))!==ref)
  .sort((a,b)=>b.points/b.pairs-a.points/a.pairs||(a.candidateSeconds/Math.max(.001,a.opponentSeconds))-(b.candidateSeconds/Math.max(.001,b.opponentSeconds))||a.key.localeCompare(b.key));
 const find=x=>Object.values(s.dossiers).find(d=>d.hypothesisKey===x.key);
 const ready=candidates.filter(x=>{const d=find(x);return !d||(d.state==='pending'&&!weak(d));});
 const previous=s.rotation.returnKey??s.active;
 let active=previous?s.dossiers[previous]:null;if(active?.referenceHash!==ref||active?.state!=='pending')active=null;
 // A dormant dossier gets at most one revisit lot before normal priority resumes.
 const due=tick-(s.rotation.lastRevisitLot??0)>=r.revisitAfter?dossiers.filter(d=>d.key!==active?.key&&tick-(d.lastServedLot??0)>=r.revisitAfter)
  .sort((a,b)=>(a.lastServedLot??0)-(b.lastServedLot??0)||a.index-b.index)[0]:null;
 let chosen=null,reason;
 if(due){chosen={key:due.hypothesisKey,profile:due.profile,dossier:due};reason='scheduled-revisit';}
 else if(active&&!weak(active)){chosen={key:active.hypothesisKey,profile:active.profile,dossier:active};reason='continue-promising-or-initial';}
 else {const alternative=ready.find(x=>find(x)?.key!==active?.key);if(alternative){chosen={...alternative,dossier:find(alternative)};reason='recurrent-finalist';}
  else if(!active&&ready.length){chosen={...ready[0],dossier:find(ready[0])};reason='recurrent-finalist';}
  else if(active){chosen={key:active.hypothesisKey,profile:active.profile,dossier:active};reason='no-ready-alternative';}}
 s.rotation.lastChoice={afterServedLots:tick,reason:reason??'waiting-for-finalist',hypothesisKey:chosen?.key??null,returnKey:reason==='scheduled-revisit'?active?.key??null:null};
 if(!chosen)s.active=null;
 return chosen;
}
