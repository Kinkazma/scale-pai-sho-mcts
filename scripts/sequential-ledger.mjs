import {referenceIdentity,referenceHash,opponentRng,drawOpponent} from './reference-pool.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {StableRng} from '../src/search.mjs';
import {hypothesis,observeSelection,rotationChoice} from './sequential-rotation.mjs';
import {hash,weights,METHOD,policyOptions,pairFacts,decision} from './sequential-evidence.mjs';
export const read=p=>JSON.parse(fs.readFileSync(p));
export const atomic=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
export function identity(plan,budget,profile){
 return hash({method:METHOD,rules:plan.rules,budget,limits:plan.config.limits,profile:weights(profile),reference:referenceIdentity(plan,budget),
  engine:Object.fromEntries(Object.entries(plan.sources).filter(([p])=>p.startsWith('src/')||p.endsWith('evolution-relational-game.mjs')||p.includes('/sequential-')||p.endsWith('reference-pool.mjs')))});
}
export function freshLedger(plan,budget){
 const policy=policyOptions(plan.config.sequentialValidation),allocation=read(path.join(policy.root,'allocation.json'));
 if(allocation.protocol!=='scale-sequential-risk-transfer-v1'||allocation.budgets[budget]!==policy.riskByBudget[budget])throw Error('Risk allocation mismatch');
 return {method:METHOD,budget,policy,nextIndex:1,selectionSeconds:0,validationSeconds:0,selectionPairs:0,validationPairs:0,active:null,dossiers:{},transactions:{}};
}
export function prepareRound(plan,budget,profile,selection,output,ledger){
 const s=structuredClone(ledger),policy=s.policy;
 if(hash(policy)!==hash(policyOptions(plan.config.sequentialValidation)))throw Error('Validation policy changed');
 for(let i=0;i<selection.length;i+=2){const f=pairFacts(selection.slice(i,i+2));s.selectionPairs++;s.selectionSeconds+=f.candidateSeconds+f.opponentSeconds;}
 const refHash=referenceHash(plan,budget);
 if(s.active&&s.dossiers[s.active].referenceHash!==refHash)s.active=null;
 const credit=s.selectionSeconds*policy.maxSearchShare/(1-policy.maxSearchShare)-s.validationSeconds;
 const gameCredit=Math.floor(s.selectionPairs*policy.maxGameShare/(1-policy.maxGameShare))-s.validationPairs;
 let choice=null;
 if(policy.rotation){
  observeSelection(s,plan,budget,selection,output);choice=rotationChoice(s,plan,budget);
  if(choice?.dossier)s.active=choice.dossier.key;
  else s.active=null;
  if(choice)profile=choice.profile;
 }
 const candidateKey=identity(plan,budget,profile);
 const canCreate=!policy.rotation||(choice&&!choice.dossier&&gameCredit>=1&&credit>=s.selectionSeconds/Math.max(1,s.selectionPairs));
 if(!s.active&&canCreate&&hash(weights(profile))!==refHash&&!s.dossiers[candidateKey]){
  const index=s.nextIndex++;s.dossiers[candidateKey]={key:candidateKey,index,alpha:policy.riskByBudget[budget]/(index*(index+1)),profile,reference:plan.references[budget],...(plan.config.referencePoolByBudget?.[budget]?{referencePool:structuredClone(plan.config.referencePoolByBudget[budget])}:{}),referenceHash:refHash,pairs:[],state:'pending'};s.active=candidateKey;
  if(policy.rotation)Object.assign(s.dossiers[candidateKey],{hypothesisKey:hypothesis(plan,budget,profile),identitySources:plan.sources,lastServedLot:s.rotation.servedLots});
 }
 const key=s.active,d=key?s.dossiers[key]:null;
 // Estimate the next cost from observed pairs. The launch cap is exact in games;
 // the time cap can overshoot by at most the already dispatched worker pairs.
 const recent=d?.pairs.slice(-8)??[],estimate=recent.length?Math.max(...recent.map(p=>p.candidateSeconds+p.opponentSeconds)):s.selectionSeconds/Math.max(1,s.selectionPairs);
 const count=d?Math.max(0,Math.min(policy.batchPairs,policy.maxPairs-d.pairs.length,gameCredit,Math.floor(credit/Math.max(.001,estimate)))):0;
 const jobs=d?validationJobs(plan,budget,d,count):[];
 return {method:METHOD,budget,output,baseHash:hash(ledger),afterSelection:s,key,jobs,costCredit:Math.max(0,credit)};
}
export function validationJobs(plan,budget,d,count){
 const pool=d.referencePool;
 const opponentStream=opponentRng(BigInt('0x'+d.key.slice(0,16)));
 const jobs=[],rng=new StableRng(BigInt('0x'+d.key.slice(0,16))+7000000000000000000n),limits=plan.config.limits;
 for(let i=0;i<d.pairs.length+count;i++){
  const limit=limits[rng.index(limits.length)],mode=rng.index(3),seed=rng.next().toString(),selected=pool?drawOpponent(pool,opponentStream):null,opponent=selected?.profile??d.reference;if(i<d.pairs.length)continue;
  const pair=`validation-${d.key}-p${String(i).padStart(6,'0')}`,options={hemispheres:mode>0,jadeHemisphere:mode===2?'south':'north',compensationSide:0};
  for(const candidateSide of [0,1])jobs.push({id:`${pair}-s${candidateSide}`,pair,phase:'validation',generation:0,candidateId:d.profile.id,candidateSide,budget,limit,seed,options,profiles:candidateSide===0?[d.profile,opponent]:[opponent,d.profile],...(selected?{referenceMember:selected.referenceMember}:{})});
 }
 return jobs;
}
export function finishRound(input,games){
 const s=structuredClone(input.afterSelection),d=input.key?s.dossiers[input.key]:null;
 if(games.length%2)throw Error('Incomplete validation pair');
 const ordered=[...games].sort((a,b)=>a.id.localeCompare(b.id));
 for(let i=0;i<ordered.length;i+=2){
  for(let j=0;j<2;j++){const expected=input.jobs[i+j],actual=ordered[i+j];if(!expected||hash(Object.fromEntries(Object.keys(expected).map(k=>[k,actual[k]])))!==hash(expected))throw Error('Validation must be a contiguous ordered prefix');}
  const pair=ordered.slice(i,i+2),f=pairFacts(pair);
  d.pairs.push({...f,id:pair[0].pair,...(pair[0].referenceMember?{referenceMember:pair[0].referenceMember}:{}),games:pair.map(g=>({path:path.join(input.output,'games',g.file),sha256:g.sha256}))});
  s.validationPairs++;s.validationSeconds+=f.candidateSeconds+f.opponentSeconds;
 }
 const assessment=d?{budget:input.budget,key:d.key,...decision(d,s.policy),...(d.referencePool?{scope:'score-against-frozen-mixture',referencePoolHash:d.referenceHash,byReference:referenceBreakdown(d)}:{})}:{budget:input.budget,eligible:false,state:'no-new-candidate',pairs:0,games:0};
 if(d){d.state=assessment.state;if(d.state!=='pending')s.active=null;}
 if(d&&s.policy.rotation&&ordered.length){
  d.lastServedLot=++s.rotation.servedLots;
  if(s.rotation.lastChoice.reason==='scheduled-revisit')s.rotation.lastRevisitLot=s.rotation.servedLots;
 }
 if(s.policy.rotation)s.rotation.returnKey=s.rotation.lastChoice.returnKey;
 s.transactions[input.output]=hash({input,games:ordered});
 return {ledger:s,assessment,acceptedProfile:assessment.eligible?d.profile:null,profile:d?.profile??null,
  cost:{selectionSeconds:s.selectionSeconds,validationSeconds:s.validationSeconds,validationPairs:s.validationPairs,selectionPairs:s.selectionPairs,searchShare:s.validationSeconds/Math.max(.001,s.selectionSeconds+s.validationSeconds)}};
}

/** Descriptive per-opponent results; never add or duplicate these in the e-process. */
function referenceBreakdown(d){
 const counts=Object.fromEntries(d.referencePool.map(e=>[e.label,{pairs:0,wins:0,draws:0,losses:0,candidateSeconds:0,opponentSeconds:0}]));
 // Receipts carry the opponent provenance independently of record statistics.
 for(const p of d.pairs){const row=counts[p.referenceMember.label];row.pairs++;for(const k of ['wins','draws','losses','candidateSeconds','opponentSeconds'])row[k]+=p[k];}
 return counts;
}
