/** Recover selection lineage from verified completed rounds; never publish it. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {replay} from '../src/engine.mjs';
import {relationalProfile} from '../src/relational-profile.mjs';
import {summary} from './evolution-profiles.mjs';
import {options,profileKey} from './evolution-relational-plan.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function prepareResume(directory){
  const root=path.resolve(directory),paused=read(path.join(root,'relational-paused.json'));
  if(paused.status.running||paused.status.phase!=='stopped')throw Error('Cooperatively paused campaign required');
  const complete=paused.status.rounds.filter(r=>r.complete);if(!complete.length)throw Error('No completed lineage to recover');
  const latest=complete.at(-1).archive,plan=read(path.join(latest,'plan.json')),status=read(path.join(latest,'status.json'));
  for(const f of ['src/engine.mjs','src/region-resolution.mjs','src/search.mjs','src/search-memory.mjs','src/search-profile.json','src/mcts-catalog.json'])
    if(hash(new URL('../'+f,import.meta.url))!==plan.sources[f])throw Error('Historical search or rules changed');
  const generation=status.generations.at(-1).generation,report=read(path.join(latest,`selection-${generation}-report.json`));
  const jobs=read(path.join(latest,`selection-${generation}-plan.json`));
  if(!report.complete||report.games.length!==jobs.length||new Set(report.games.map(g=>g.id)).size!==jobs.length)throw Error('Incomplete selection');
  const verified=jobs.map(job=>{
    const row=report.games.find(g=>g.id===job.id),file=path.join(latest,'games',job.id+'.json');
    if(!row||row.file!==job.id+'.json'||hash(file)!==row.sha256)throw Error('Selection journal hash mismatch');
    const record=read(file);replay(record);
    if(record.turnLimit!==job.limit||record.compensation!==0||JSON.stringify(record.options)!==JSON.stringify(job.options)||
       JSON.stringify(record.agents)!==JSON.stringify({players:[String(job.budget),String(job.budget)],profiles:job.profiles,seed:String(job.seed)}))throw Error('Selection identity mismatch');
    return {...job,result:record.result,statistics:record.statistics};
  });
  const initialParentsByBudget={},initialHistoryByBudget={};
  for(const b of plan.config.budgets){
    const candidates=[...new Map(jobs.filter(j=>j.budget===b).map(j=>[j.candidateId,j.profiles[j.candidateSide]])).values()];
    const ranked=candidates.map((profile,index)=>({profile,index,...summary(verified.filter(g=>g.budget===b&&g.candidateId===profile.id))}))
      .sort((a,b)=>b.scoreRate-a.scoreRate||a.index-b.index);
    const selected=ranked[0].profile,old=status.champion;
    const parents=[{...old,id:`saved-global-b${b}`},{...selected,id:`saved-budget-b${b}`},relationalProfile({...selected,id:`migrated-relational-b${b}`}),
      ...complete.slice(-4).map((r,i)=>({...r.champion,id:`saved-finalist-${i}-b${b}`}))];
    initialParentsByBudget[b]=[...new Map(parents.map(p=>[profileKey(p),p])).values()];
    initialHistoryByBudget[b]=complete.slice(-8).map((r,i)=>({...r.champion,id:`saved-ancestor-${i}-b${b}`}));
  }
  return options({generations:2,offspring:3,elites:2,selectionPairsPerBudget:6,confirmationPairsPerBudget:32,
    budgets:plan.config.budgets,limits:plan.config.limits,workers:2,seed:plan.config.seed+100003,
    maxActiveSeconds:Math.max(1,Math.floor(paused.remainingSeconds)),initialParentsByBudget,initialHistoryByBudget,
    sourceLineage:{pausedDirectory:root,pausedSha256:hash(path.join(root,'relational-paused.json')),selectionArchive:latest,
      selectionPlanSha256:hash(path.join(latest,`selection-${generation}-plan.json`)),verifiedGames:verified.length,
      meaning:'Saved parents and budget specialists seed exploration; selection is not a confirmation or live publication.'}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [directory,destination]=process.argv.slice(2);if(!directory||!destination)throw Error('Usage: node scripts/prepare-relational-resume.mjs PAUSED_DIRECTORY NEW_CONFIG');
 const config=prepareResume(directory);delete config.familyIndex;
 fs.writeFileSync(destination,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({config:destination,remainingSeconds:config.maxActiveSeconds,budgets:config.budgets,verifiedGames:config.sourceLineage.verifiedGames}));
}
