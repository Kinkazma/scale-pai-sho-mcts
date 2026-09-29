/** Explicit offline migration. The caller archives originals and commits under lock. */
import {hash} from './sequential-evidence.mjs';
import {identity} from './sequential-ledger.mjs';
import {verifyDossier} from './sequential-validation.mjs';
import {hypothesis,evidenceSources,rotationOptions,observeSelection} from './sequential-rotation.mjs';
export function migrateLedger(before,oldPlans,newPlan,selectionBatches){
 const s=structuredClone(before),budget=s.budget;
 if(before.policy.rotation)throw Error('Rotation already migrated');
 const {rotation,...unchanged}=newPlan.config.sequentialValidation;
 if(hash(unchanged)!==hash(before.policy))throw Error('Migration must preserve the full evidence policy and risk allocation');
 const r=rotationOptions(rotation);s.policy={...before.policy,rotation:r};
 for(const d of Object.values(s.dossiers)){
  const oldPlan=oldPlans.find(p=>identity(p,budget,d.profile)===d.key);
  if(!oldPlan)throw Error('Missing original dossier plan');
  if(hash(evidenceSources(oldPlan))!==hash(evidenceSources(newPlan)))throw Error('Game/evidence semantics changed');
  verifyDossier(d,oldPlan);
  d.identitySources=oldPlan.sources;d.hypothesisKey=hypothesis(oldPlan,budget,d.profile);d.lastServedLot=0;
  verifyDossier(d,{...newPlan,references:{[budget]:d.reference}});
 }
 for(const batch of selectionBatches){
  if(hash(batch.plan.references[budget])!==hash(newPlan.references[budget]))continue;
  if(hash(evidenceSources(batch.plan))!==hash(evidenceSources(newPlan)))throw Error('Selection history semantics changed');
  observeSelection(s,newPlan,budget,batch.games,batch.output);
 }
 if(!s.rotation)observeSelection(s,newPlan,budget,[],'migration');
 s.rotation.servedLots=0;s.rotation.migratedFromLedger=hash(before);
 return s;
}
