/** Read-only verification of relocated parents, jobs and ALL accumulated evidence. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const output=path.resolve(process.argv[2]);
const read=p=>JSON.parse(fs.readFileSync(p));
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const receipt=read(path.join(output,'restoration.json')),campaign=receipt.campaign,state=read(path.join(campaign,'status.json'));
const report={frozenSources:0,validationDossiers:0,validationPairs:0,partialGames:0,budgets:{},trainingStarted:false};
for(const folder of [campaign,...Object.values(state.lanes).map(l=>l.archive)]){
 for(const [name,sha]of Object.entries(read(path.join(folder,'source-hashes.json')))){
  if(digest(path.join(folder,'runtime',name))!==sha)throw Error('Frozen source changed');report.frozenSources++;
 }
}
for(const [budget,lane]of Object.entries(state.lanes)){
 const saved=read(path.join(lane.archive,'status.json')),current=saved.archive,plan=read(path.join(current,'plan.json'));
 const module=p=>import(pathToFileURL(path.join(lane.archive,'runtime/scripts',p)));
 const {initialParents,population,jobsFor}=await module('evolution-relational-plan.mjs');
 const {hash,pairFacts}=await module('sequential-evidence.mjs');
 const {verifyDossier}=await module('sequential-validation.mjs');
 const parents=initialParents(plan),candidates={[budget]:population(parents[budget],1,Number(budget),plan.config.offspring,plan.config.seed)};
 const jobs=jobsFor(plan,'selection',1,candidates,plan.config.initialHistoryByBudget);
 const stored=read(path.join(current,'selection-1-plan.json'));
 if(hash(jobs)!==hash(stored))throw Error('Selection jobs/seeds/parents changed');
 const partial=read(path.join(current,'selection-1-report.json'));
 for(const game of partial.games){
  const file=path.join(current,'games',game.file);
  if(digest(file)!==game.sha256)throw Error('Partial game changed');
  const job=jobs.find(j=>j.id===game.id);
  if(!job||hash(Object.fromEntries(Object.keys(job).map(k=>[k,game[k]])))!==hash(job))throw Error('Partial selection job changed');
  report.partialGames++;
 }
 const ledger=read(path.join(plan.config.sequentialValidation.root,`budget-${budget}.json`));
 for(const d of Object.values(ledger.dossiers)){
  // Each dossier retains its own original reference mixture and source hashes.
  const historical={...plan,sources:d.identitySources,
   references:{[budget]:d.reference},config:{...plan.config,referencePoolByBudget:d.referencePool?{[budget]:d.referencePool}:undefined}};
  verifyDossier(d,historical,{replayGames:true});
  report.validationDossiers++;report.validationPairs+=d.pairs.length;
 }
 report.budgets[budget]={round:saved.round,seed:saved.baseConfig.seed,nextValidationIndex:ledger.nextIndex,
  activeDossier:ledger.active,selectionPairs:ledger.selectionPairs,validationPairs:ledger.validationPairs,
  partialGames:partial.games.length};
}
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
