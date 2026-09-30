#!/usr/bin/env python3
"""Restore the closed historical evolutionary state with a new explicit duration."""
import argparse
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
STRING=re.compile(rb'"(?:[^"\\]|\\.)*"')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value,indent=2)+'\n')


def localize(data, root):
    def replace(match):
        value=json.loads(match[0])
        if value.startswith('@history/'):
            relative=Path(value[9:])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Invalid historical path')
            return json.dumps(str(root/relative)).encode()
        return match[0]
    return STRING.sub(replace,data)


def prepare(archive, output, seconds):
    archive=archive.resolve();output=output.resolve()
    if output.exists() or not isinstance(seconds,int) or not 1<=seconds<=129600:
        raise ValueError('New output and an explicit duration from 1 to 129600 seconds required')
    manifest=json.loads((archive/'manifest.json').read_text())
    if manifest['schema']!='scale-historical-export-v1':
        raise ValueError('Unknown archive schema')
    # Verify the entire optional archive before creating a runnable restoration.
    for name,expected in manifest['files'].items():
        path=archive/name
        if Path(name).is_absolute() or '..' in Path(name).parts or path.is_symlink():
            raise ValueError('Invalid export member')
        data=path.read_bytes()
        if len(data)!=expected['bytes'] or sha(data)!=expected['sha256']:
            raise ValueError('Historical export member changed: '+name)
    output.mkdir(parents=True)
    workspace=output/'history'
    for name in manifest['files']:
        data=(archive/name).read_bytes()
        target=workspace/name;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(localize(data,workspace) if target.suffix=='.json' else data)
    campaign=workspace/manifest['campaign']
    state=json.loads((campaign/'status.json').read_text())
    # Preparing grants no elapsed training time: run establishes the new deadline.
    receipt={'schema':'scale-historical-continuation-v1','campaign':str(campaign),
             'archive_manifest_sha256':sha((archive/'manifest.json').read_bytes()),
             'historical_closed':json.loads((campaign/'CLOSED.json').read_text()),
             'seconds':seconds,'budgets':{},'automatic_resume':False,'started':False}
    for budget,lane in state['lanes'].items():
        folder=Path(lane['archive']);saved=json.loads((folder/'status.json').read_text())
        current=Path(saved['archive'])
        if saved['progress']['stage']!='paused-selection' or (current/'validation-input.json').exists():
            raise ValueError('This exporter supports the captured partial-selection boundary only')
        receipt['budgets'][budget]={'round':saved['round'],'seed':saved['baseConfig']['seed'],
            'selection_plan_sha256':sha((current/'selection-1-plan.json').read_bytes()),
            'partial_games':len(json.loads((current/'selection-1-report.json').read_text())['games'])}
    (campaign/'CLOSED.json').rename(campaign/'HISTORICAL_CLOSURE.json')
    write(output/'restoration.json',receipt)
    subprocess.run(['node',str(ROOT/'scripts/verify-history.mjs'),str(output)],check=True,cwd=ROOT)
    return receipt


def run(output):
    receipt=json.loads((output/'restoration.json').read_text())
    if receipt['started']:
        raise ValueError('This restoration already started; never grant its duration twice')
    campaign=Path(receipt['campaign'])
    state=json.loads((campaign/'status.json').read_text())
    started=time.time();deadline=started+receipt['seconds']
    for lane in state['lanes'].values():
        folder=Path(lane['archive']);saved=json.loads((folder/'status.json').read_text())
        current=Path(saved['archive']);number=saved['round']
        saved.update(pid=None,childPid=None,running=False,phase='paused',remainingSeconds=receipt['seconds'])
        saved['baseConfig']['absoluteDeadline']=deadline
        write(folder/'status.json',saved)
        config_path=folder/f'round-{number:03d}-input.json'
        config=json.loads(config_path.read_text())
        config.update(absoluteDeadline=deadline,maxActiveSeconds=receipt['seconds'])
        write(config_path,config)
        # Regenerate only run-control metadata using the EXACT frozen algorithm.
        script="""import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const [module,configPath,round]=process.argv.slice(1);
const {options,initialPlan}=await import(pathToFileURL(module));
const input=JSON.parse(fs.readFileSync(configPath)),old=JSON.parse(fs.readFileSync(round+'/plan.json'));
const config=options({...input,familyIndex:1}),plan={...initialPlan(config),sources:old.sources};
fs.writeFileSync(round+'/plan.json',JSON.stringify(plan,null,2)+'\\n');
fs.writeFileSync(round+'/config.json',JSON.stringify(config,null,2)+'\\n');"""
        subprocess.run(['node','--input-type=module','-e',script,
                        str(folder/'runtime/scripts/evolution-relational-plan.mjs'),str(config_path),str(current)],check=True)
        lane.update(pid=None,childPid=None,phase='paused')
    state.update(pid=None,running=False,phase='paused',deadline=deadline,
                 historicalStartedAt=state['startedAt'],startedAt=started,
                 remainingSeconds=receipt['seconds'],authorizedSeconds=receipt['seconds'])
    state.pop('finishedAt',None)
    write(campaign/'status.json',state)
    receipt.update(started=True,new_deadline=deadline)
    write(output/'restoration.json',receipt)
    subprocess.run(['python3',str(campaign/'runtime/scripts/run-independent-campaign.py'),
                    str(campaign/'original-config.json'),str(campaign),'--resume'],check=True)
    final=json.loads((campaign/'status.json').read_text())
    if final.get('error') or final.get('running'):
        raise RuntimeError('Historical continuation did not close cleanly: '+str(final.get('error')))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['prepare','verify','run'])
    p.add_argument('--archive',type=Path,default=ROOT/'assets/history')
    p.add_argument('--output',type=Path,required=True);p.add_argument('--seconds',type=int)
    a=p.parse_args();output=a.output.resolve()
    if a.command=='prepare':
        if a.seconds is None:p.error('--seconds is required')
        print(json.dumps(prepare(a.archive,output,a.seconds)))
    elif a.command=='verify':subprocess.run(['node',str(ROOT/'scripts/verify-history.mjs'),str(output)],check=True,cwd=ROOT)
    else:run(output)
