import {referenceHash} from './reference-pool.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {acquireMeasurementLock} from './measurement-lock.mjs';
import {read,atomic,freshLedger,prepareRound,finishRound,identity,validationJobs} from './sequential-ledger.mjs';
import {hash,weights,pairFacts} from './sequential-evidence.mjs';
import {replay} from '../src/engine.mjs';
import {hypothesis,evidenceSources} from './sequential-rotation.mjs';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
/** Rebuild evidence from immutable journals, never trust stored W/D/L or cost. */
export function verifyDossier(d,plan,{replayGames=false}={}){
 const budget=plan.config.budgets[0],seen=new Set();
 const original=d.identitySources?{...plan,sources:d.identitySources}:plan;
 if(identity(original,budget,d.profile)!==d.key||d.referenceHash!==referenceHash(plan,budget)||hash(weights(d.reference))!==hash(weights(plan.references[budget]))||hash(d.referencePool??null)!==hash(plan.config.referencePoolByBudget?.[budget]??null)||hash(evidenceSources(original))!==hash(evidenceSources(plan))||(d.hypothesisKey&&d.hypothesisKey!==hypothesis(plan,budget,d.profile)))throw Error('Validation dossier identity mismatch');
 for(const [index,p] of d.pairs.entries()){
  const jobs=validationJobs(plan,budget,{...d,pairs:d.pairs.slice(0,index)},1);
  if(hash(p.referenceMember??null)!==hash(jobs[0].referenceMember??null))throw Error('Validation opponent provenance mismatch');
  if(p.id!==jobs[0].pair||seen.has(p.id))throw Error('Duplicate/out-of-order validation pair');seen.add(p.id);
  if(p.games.length!==2||p.games[0].path===p.games[1].path)throw Error('Distinct paired journals required');
  const records=p.games.map((receipt,side)=>{
   const body=fs.readFileSync(receipt.path);if(digest(body)!==receipt.sha256)throw Error('Validation journal hash mismatch');
   const r=JSON.parse(body),job=jobs[side],agents={players:[String(budget),String(budget)],profiles:job.profiles,seed:String(job.seed)};
   if(hash(r.referenceMember??null)!==hash(job.referenceMember??null))throw Error('Validation opponent provenance mismatch');
   if(r.rules!==plan.rules||!r.result||r.turnLimit!==job.limit||r.compensation!==0||hash(r.options)!==hash(job.options)||hash(r.agents)!==hash(agents)||path.basename(receipt.path)!==job.id+'.json')throw Error('Validation identity mismatch');
   if(replayGames)replay(r);
   return {pair:p.id,candidateSide:side,result:r.result,statistics:r.statistics};
  });
  const facts=pairFacts(records);for(const k of Object.keys(facts))if(facts[k]!==p[k])throw Error('Validation evidence mismatch');
 }
}
export async function runSequential({plan,output,profile,selection,batch,stopped}){
 const budget=plan.config.budgets[0],root=plan.config.sequentialValidation.root,file=path.join(root,`budget-${budget}.json`);
 fs.mkdirSync(root,{recursive:true});const unlock=acquireMeasurementLock(path.join(root,`budget-${budget}.lock`));
 try{
  const ledger=fs.existsSync(file)?read(file):freshLedger(plan,budget),inputFile=path.join(output,'validation-input.json'),resultFile=path.join(output,'validation-result.json');
  const selectionDigest=hash(selection),planHash=hash(plan);
  const input=fs.existsSync(inputFile)?read(inputFile):{...prepareRound(plan,budget,profile,selection,output,ledger),selectionDigest,planHash};
  if(input.selectionDigest!==selectionDigest||input.planHash!==planHash)throw Error('Validation resume inputs changed');
  const previous=fs.existsSync(resultFile)?read(resultFile):null;
  if(ledger.transactions[output]&&previous?.finished){
   if(ledger.transactions[output]!==previous.ledger.transactions[output])throw Error('Validation transaction mismatch');
   return {...sequentialAssessment(output,plan),finished:true,planHash};
  }
  if(previous?.finished&&hash(ledger)===input.baseHash){
   const recovered=sequentialAssessment(output,plan);atomic(file,recovered.ledger);return {...recovered,finished:true,planHash};
  }
  if(hash(ledger)!==input.baseHash&&(!previous||hash(ledger)!==hash(previous.ledger)))throw Error('Concurrent or stale validation transaction');
  if(input.key)verifyDossier(input.afterSelection.dossiers[input.key],plan);
  if(!fs.existsSync(inputFile))atomic(inputFile,input);
  const report=await batch(input.jobs,'validation',{costCredit:input.costCredit});
  const result={...finishRound(input,report.games),finished:!stopped(),planHash};
  if(result.assessment.eligible)verifyDossier(result.ledger.dossiers[input.key],plan,{replayGames:true});
  // Result first permits recovery if interrupted between the two atomic writes.
  atomic(resultFile,result);atomic(file,result.ledger);
  return result;
 }finally{unlock();}
}

/** Recompute a saved transaction for publication/review, including its old pairs. */
export function sequentialAssessment(output,plan){
 const input=read(path.join(output,'validation-input.json')),report=read(path.join(output,'validation-report.json')),saved=read(path.join(output,'validation-result.json'));
 if(input.planHash!==hash(plan)||!saved.finished)throw Error('Incomplete or mismatched validation transaction');
 const result=finishRound(input,report.games);
 if(hash(result.ledger)!==hash(saved.ledger))throw Error('Validation transaction altered');
 if(input.key)verifyDossier(result.ledger.dossiers[input.key],plan,{replayGames:true});
 return result;
}
