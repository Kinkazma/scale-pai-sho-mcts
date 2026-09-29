/** Recompute acceptance from verified game files, never from a claimed score.
 * Default is a reviewable proposal; --apply atomically updates eligible budgets. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {sequentialAssessment} from './sequential-validation.mjs';
import {RULES,replay} from '../src/engine.mjs';
import {createSearchSession} from '../src/search-runtime.mjs';
import {SOURCES} from './relational-sources.mjs';
import {jobsFor,assess} from './evolution-relational-plan.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f));

export function publicationProposal(directory){
  const output=path.resolve(directory),planFile=path.join(output,'plan.json'),plan=read(planFile),candidate=read(path.join(output,'candidate.json'));
  if(!['regions-relational-evolution-v2','regions-relational-evolution-v3-sequential'].includes(plan.protocol)||plan.rules!==RULES||!candidate.complete||candidate.rules!==RULES||candidate.planSha256!==hash(fs.readFileSync(planFile)))throw Error('Complete current-rule confirmation required');
  for(const f of SOURCES)
    if(hash(fs.readFileSync(new URL('../'+f,import.meta.url)))!==plan.sources[f])throw Error('Live engine or profiles changed since the trial');
  let assessment,profiles=candidate.profiles;
  if(plan.protocol==='regions-relational-evolution-v3-sequential'){
    const result=sequentialAssessment(output,plan);assessment=[result.assessment];profiles=result.acceptedProfile?{[plan.config.budgets[0]]:result.acceptedProfile}:{};
  }else{
  for(const b of plan.config.budgets)createSearchSession(profiles[b]);
  const expected=jobsFor(plan,'confirmation',0,Object.fromEntries(plan.config.budgets.map(b=>[b,[profiles[b]]])));
  if(JSON.stringify(read(path.join(output,'confirmation-plan.json')))!==JSON.stringify(expected))throw Error('Confirmation plan mismatch');
  const report=read(path.join(output,'confirmation-report.json'));
  if(!report.complete||report.games.length!==expected.length||new Set(report.games.map(g=>g.id)).size!==expected.length)throw Error('Incomplete confirmation games');
  const verified=expected.map(job=>{
    const g=report.games.find(g=>g.id===job.id),file=job.id+'.json';
    if(!g||g.file!==file)throw Error('Missing confirmation game');
    const body=fs.readFileSync(path.join(output,'games',file));if(hash(body)!==g.sha256)throw Error('Game hash mismatch');
    const record=JSON.parse(body);replay(record);
    const agents={players:[String(job.budget),String(job.budget)],profiles:job.profiles,seed:String(job.seed)};
    if(record.rules!==RULES||record.turnLimit!==job.limit||record.compensation!==0||JSON.stringify(record.options)!==JSON.stringify(job.options)||JSON.stringify(record.agents)!==JSON.stringify(agents)||!record.result)throw Error('Game identity mismatch');
    if(!record.statistics.searchSeconds.every(x=>Number.isFinite(x)&&x>=0))throw Error('Invalid measured cost');
    return {...job,result:record.result,statistics:record.statistics};
  });
  assessment=assess(plan,verified);
  }
  const eligible=assessment.filter(s=>s.eligible).map(s=>s.budget);
  const previous=read(new URL('../src/mcts-catalog.json',import.meta.url));
  const proposed={...previous,status:eligible.length?'evolution-confirmed-unrated':previous.status,
    profiles:{...previous.profiles,...Object.fromEntries(eligible.map(b=>[b,profiles[b]]))},ratings:eligible.length?[]:previous.ratings,
    evolutionEvidence:{archive:path.basename(output),planSha256:candidate.planSha256,eligibleBudgets:eligible,assessment}};
  return {eligible,assessment,previous,proposed};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.argv[2];if(!directory)throw Error('Usage: node scripts/publish-relational.mjs ARCHIVE [--apply]');
  const proposal=publicationProposal(directory);
  fs.writeFileSync(path.join(directory,'publication-proposal.json'),JSON.stringify(proposal,null,2)+'\n');
  if(process.argv.includes('--apply')&&proposal.eligible.length){
    const dest=fileURLToPath(new URL('../src/mcts-catalog.json',import.meta.url));
    fs.writeFileSync(path.join(directory,'pre-publication-catalog.json'),JSON.stringify(proposal.previous,null,2)+'\n',{flag:'wx'});
    fs.writeFileSync(dest+'.tmp',JSON.stringify(proposal.proposed,null,2)+'\n');fs.renameSync(dest+'.tmp',dest);
    fs.writeFileSync(path.join(directory,'published-catalog.json'),JSON.stringify(proposal.proposed,null,2)+'\n');
  }
  console.log(JSON.stringify({eligible:proposal.eligible,applied:process.argv.includes('--apply')&&proposal.eligible.length>0,assessment:proposal.assessment},null,2));
}
