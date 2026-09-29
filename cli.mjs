#!/usr/bin/env node
/** Local computation and explicit, bounded evolutionary training. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {initialState,legalActions,replay,RULES} from './src/engine.mjs';
import {generationProfile,GENERATIONS} from './src/ai-generations.mjs';
import {createSearchSession} from './src/search-runtime.mjs';
import {playMatch} from './scripts/evolution-relational-game.mjs';
import {population} from './scripts/evolution-relational-plan.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const [command,...args]=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const number=(name,fallback)=>{const n=Number(arg(name,fallback));if(!Number.isSafeInteger(n)||n<1)throw Error(`Invalid --${name}`);return n;};
const read=p=>JSON.parse(fs.readFileSync(p));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const run=(program,argv)=>{const r=spawnSync(program,argv,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;process.exitCode=r.status??1;};
const gen=()=>number('generation',read(path.join(root,'release.json')).defaultGeneration);
const budget=()=>number('budget',32);
const seed=()=>number('seed',71);
if(command==='doctor'){
 console.log(JSON.stringify({node:process.version,rules:RULES,cpus:os.availableParallelism(),generations:GENERATIONS.map(g=>({id:g.id,budgets:Object.keys(g.profiles)})),python:spawnSync('python3',['--version'],{encoding:'utf8'}).stdout?.trim()},null,2));
}else if(command==='choose'){
 const record=arg('record',null),state=record?replay(read(record)).at(-1):initialState(15);
 const result=createSearchSession(generationProfile(budget(),gen())).search(state,budget(),seed());
 if(result.action&&!legalActions(state).some(a=>JSON.stringify(a)===JSON.stringify(result.action)))throw Error('Illegal decision');
 console.log(JSON.stringify(result,null,2));
}else if(command==='match'){
 const b=budget(),g=gen(),other=number('opponent',g),output=path.resolve(arg('output','match.json'));
 if(fs.existsSync(output))throw Error('Output exists');
 const result=playMatch({id:'local-match',seed:String(seed()),limit:number('turns',15),budget:b,profiles:[generationProfile(b,g),generationProfile(b,other)],options:{hemispheres:false,jadeHemisphere:'north',compensationSide:0}});
 write(output,result);console.log(JSON.stringify({output,result:result.result,statistics:result.statistics}));
}else if(command==='train'){
 const output=path.resolve(arg('output','runs/campaign')),g=gen(),budgets=arg('budgets','8,32').split(',').map(Number);
 if(fs.existsSync(output)||fs.existsSync(output+'.config.json'))throw Error('Use a new output or resume the existing campaign');
 if(budgets.some(b=>!Number.isSafeInteger(b)||b<1)||new Set(budgets).size!==budgets.length)throw Error('Invalid budgets');
 const workers=number('workers',Math.min(64,Math.max(budgets.length,os.availableParallelism())));
 const config={generations:2,offspring:7,elites:2,selectionPairsPerBudget:6,confirmationPairsPerBudget:32,limits:[15,20,30],budgets,workers,seed:seed(),maxActiveSeconds:number('seconds',1800),maxCostRatio:1.25,advanceTrainingReferences:false,
  familyRegistry:path.join(output,'..',path.basename(output)+'-families.json'),initialParentsByBudget:{},referencesByBudget:{},referencePoolByBudget:{},
  sequentialValidation:{root:output+'-validation',riskByBudget:Object.fromEntries(budgets.map(b=>[b,Math.min(.025,.05/budgets.length)])),rotation:{}}};
 // All generations evolve under the current rules. This is a NEW campaign, not
 // a reset of any previous campaign's statistical ledger.
 for(const b of budgets){
  const p=generationProfile(b,g);config.referencesByBudget[b]=p;
  config.initialParentsByBudget[b]=population([p],0,b,1,config.seed);
  config.referencePoolByBudget[b]=GENERATIONS.filter(x=>x.id<=g&&x.profiles[b]).map(x=>({label:`G${x.id}`,profile:x.profiles[b]}));
 }
 fs.mkdirSync(path.dirname(output),{recursive:true});
 if(fs.existsSync(config.sequentialValidation.root)||fs.existsSync(config.familyRegistry))throw Error('Existing validation history: use resume or a distinct campaign name');
 fs.mkdirSync(config.sequentialValidation.root);write(path.join(config.sequentialValidation.root,'allocation.json'),{protocol:'scale-sequential-risk-transfer-v1',budgets:config.sequentialValidation.riskByBudget,origin:'new-independent-public-campaign'});
 write(output+'.config.json',config);
 run('python3',[path.join(root,'scripts/run-independent-campaign.py'),output+'.config.json',output]);
}else if(command==='resume'){
 const output=path.resolve(arg('output','runs/campaign'));
 run('python3',[path.join(output,'runtime/scripts/run-independent-campaign.py'),path.join(output,'original-config.json'),output,'--resume']);
}else if(command==='pause'){
 const output=path.resolve(arg('output','runs/campaign'));read(path.join(output,'status.json'));
 fs.closeSync(fs.openSync(path.join(output,'STOP'),'w'));console.log('Cooperative pause requested; the current game pairs will finish.');
}else if(command==='status'){
 console.log(JSON.stringify(read(path.join(path.resolve(arg('output','runs/campaign')),'status.json')),null,2));
}else{
 console.log(`Scale MCTS (G3 / MCTS 32 by default)\n\nnode cli.mjs doctor\nnode cli.mjs choose [--generation 3 --budget 32 --record game.json]\nnode cli.mjs match --generation 3 --opponent 2 --budget 32 --output game.json\nnode cli.mjs train --generation 3 --budgets 8,32 --seconds 1800 --workers 4 --output runs/new\nnode cli.mjs pause --output runs/new\nnode cli.mjs resume --output runs/new\nnode cli.mjs status --output runs/new\n\nTraining never starts implicitly. Expired deadlines are not extended by resume.`);
 if(command)process.exitCode=1;
}
