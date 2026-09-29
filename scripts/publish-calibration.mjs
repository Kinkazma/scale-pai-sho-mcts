import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {replay,outcome,RULES} from '../src/engine.mjs';
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw Error('Input and output directories required');
const report=JSON.parse(fs.readFileSync(path.join(input,'report.json'),'utf8'));
if(report.plan.rules!==RULES)throw Error('Incompatible calibration');
const verified=[];
for(const game of report.games){
 const body=fs.readFileSync(path.join(input,game.file)),record=JSON.parse(body);
 const states=replay(record);if(JSON.stringify(outcome(states.at(-1)))!==JSON.stringify(game.result))throw Error('Result mismatch');
 if(record.compensation!==game.compensation)throw Error('Compensation mismatch');
 game.sha256=crypto.createHash('sha256').update(body).digest('hex');verified.push({file:game.file,body});
}
fs.mkdirSync(output); // Never overwrite an earlier published measurement.
for(const {file,body} of verified)fs.writeFileSync(path.join(output,file),body,{flag:'wx'});
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(`Published ${verified.length} verified games to ${output}`);
