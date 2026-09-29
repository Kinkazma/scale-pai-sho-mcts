import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publicationProposal} from '../scripts/publish-evolution.mjs';
test('a finite evolutionary run completes and frozen-runtime resume preserves every game byte',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'regions-evolve-')),output=path.join(temp,'run'),configFile=path.join(temp,'config.json');
  const config={generations:1,offspring:1,selectionPairs:1,confirmationPairsPerBudget:1,budgets:[8],limits:[15],workers:1,seed:4349,maxActiveSeconds:120};
  fs.writeFileSync(configFile,JSON.stringify(config));
  const run=script=>spawnSync(process.execPath,[script,output,configFile],{encoding:'utf8',timeout:120000});
  try{
    const first=run(fileURLToPath(new URL('../scripts/evolve.mjs',import.meta.url)));
    assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(fs.readFileSync(path.join(output,'status.json'))).complete,true);
    const files=fs.readdirSync(path.join(output,'games')),contents=files.map(f=>fs.readFileSync(path.join(output,'games',f),'utf8'));
    assert.equal(files.length,6);
    const frozen=path.join(output,'runtime/scripts/evolve.mjs'),second=run(frozen);assert.equal(second.status,0,second.stderr);
    assert.deepEqual(files.map(f=>fs.readFileSync(path.join(output,'games',f),'utf8')),contents);
    const candidate=JSON.parse(fs.readFileSync(path.join(output,'candidate.json')));assert.equal(candidate.assessment[0].eligible,false,'tiny sample cannot authorize publication');
    const proposal=publicationProposal(output);assert.deepEqual(proposal.eligible,[]);
    assert.deepEqual(proposal.proposed.profiles,proposal.previous.profiles,'unconfirmed budgets preserve their live profile');
    candidate.assessment[0].eligible=true;
    fs.writeFileSync(path.join(output,'candidate.json'),JSON.stringify(candidate));
    assert.deepEqual(publicationProposal(output).eligible,[],'claimed acceptance is recomputed from the games');
    const confirmationFile=files.find(f=>f.startsWith('confirmation-'));
    assert.ok(confirmationFile);
    const target=path.join(output,'games',confirmationFile),original=fs.readFileSync(target);
    fs.appendFileSync(target,' ');
    assert.throws(()=>publicationProposal(output),/Game hash mismatch/);
    fs.writeFileSync(target,original);
    assert.equal(fs.existsSync(path.join(output,'controller.lock')),false);
    fs.writeFileSync(configFile,JSON.stringify({...config,seed:4350}));assert.notEqual(run(frozen).status,0);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
