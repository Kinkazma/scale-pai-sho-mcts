"""Finite, frozen, resumable per-budget evolution. No live profile publication."""
import argparse, hashlib, json, os, shutil, signal, subprocess, time
from pathlib import Path

def atomic(file, value):
    temp=file.with_suffix(file.suffix+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(file)

def advance_lineage(config, result):
    """Selection keeps exploring; only a complete accepted holdout changes its reference."""
    config['seed']+=100003
    config['initialHistoryByBudget']=result['history']
    config['initialParentsByBudget']=result['elites']
    if config.get('advanceTrainingReferences') and not config.get('referencePoolByBudget') and result.get('complete'):
        for assessment in result.get('assessment',[]):
            if assessment.get('eligible'):
                budget=str(assessment['budget'])
                config.setdefault('referencesByBudget',{})[budget]=result.get('acceptedProfiles',result['champions'])[budget]

def run(config_file, output, resume=False):
    root=Path(__file__).resolve().parents[1];output=output.resolve();runtime=output/'runtime'
    previous=json.loads((output/'status.json').read_text()) if resume else None
    if previous:
        for pid in [previous['pid'],previous.get('childPid')]:
            if not pid: continue
            try: os.kill(pid,0)
            except ProcessLookupError: pass
            else: raise RuntimeError('Previous supervisor or round still alive')
        # After an unclean exit the round may have kept computing. Never grant the
        # elapsed wall time again; a cooperative pause preserves its exact remainder.
        if previous.get('running'):
            previous['remainingSeconds']=min(previous['remainingSeconds'],max(0,previous['deadline']-time.time()))
        if previous.get('remainingSeconds',0)<1: raise RuntimeError('No authorized time remains')
        for name,expected in json.loads((output/'source-hashes.json').read_text()).items():
            if hashlib.sha256((runtime/name).read_bytes()).hexdigest()!=expected: raise RuntimeError('Frozen source changed: '+name)
        state=previous
        current=Path(state['archive']) if state.get('archive') else None
        for stop_file in [output/'STOP',current/'STOP' if current else output/'STOP']:
            stop_file.unlink(missing_ok=True)
    else:
        output.mkdir(parents=True,exist_ok=False)
        names=json.loads(subprocess.check_output(['node','--input-type=module','-e',
            "import {SOURCES} from './scripts/relational-sources.mjs';console.log(JSON.stringify(SOURCES))"],cwd=root,text=True))
        for name in names:
            dest=runtime/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/name,dest)
        atomic(output/'source-hashes.json',{name:hashlib.sha256((runtime/name).read_bytes()).hexdigest() for name in names})
        config=json.loads(config_file.read_text());config.pop('familyIndex',None)
        config['familyRegistry']=str(Path(config.get('familyRegistry',root/'reports/relational-family-registry.json')).resolve())
        state=dict(baseConfig=config,round=0,rounds=[],remainingSeconds=config['maxActiveSeconds'],archive=None,
                   publication='No live profile changes',protocol='regions-relational-campaign-v2')
        atomic(output/'original-config.json',config)
    started=time.time();deadline=min(started+state['remainingSeconds'],state['baseConfig'].get('absoluteDeadline',float('inf')))
    if deadline<=started: raise RuntimeError('Authorized absolute deadline has expired')
    stop=False;child=None;current=None
    def request_stop(*_):
        nonlocal stop
        stop=True
    signal.signal(signal.SIGTERM,request_stop);signal.signal(signal.SIGINT,request_stop)
    state.update(pid=os.getpid(),running=True,complete=False,phase='evolution',startedAt=started,deadline=deadline,error=None)
    atomic(output/'status.json',state)
    try:
        while time.time()<deadline and not stop and not (output/'STOP').exists():
            index=state['round'];current=output/f'round-{index:03d}';current.mkdir(exist_ok=True)
            config_path=output/f'round-{index:03d}-input.json'
            if not config_path.exists():
                config={**state['baseConfig'],'maxActiveSeconds':max(1,int(deadline-time.time()))}
                atomic(config_path,config)
            state.update(archive=str(current),phase='evolution')
            with (output/f'round-{index:03d}.log').open('ab',buffering=0) as log:
                child=subprocess.Popen(['node',str(runtime/'scripts/evolve-relational.mjs'),str(current),str(config_path)],
                    cwd=runtime,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
                state['childPid']=child.pid;atomic(output/'status.json',state)
                while child.poll() is None:
                    if stop or time.time()>=deadline or (output/'STOP').exists(): (current/'STOP').touch()
                    if (current/'status.json').exists(): state['progress']=json.loads((current/'status.json').read_text())
                    state['observedAt']=time.time();state['remainingSeconds']=max(0,deadline-time.time())
                    atomic(output/'status.json',state);time.sleep(2)
            if child.returncode!=0: raise RuntimeError(f'Round {index} failed ({child.returncode})')
            child=None;result=json.loads((current/'status.json').read_text());state['progress']=result
            state['rounds']=[r for r in state['rounds'] if r['archive']!=str(current)]
            state['rounds'].append(dict(archive=str(current),complete=result['complete'],champions=result['champions']))
            if not result['complete']: break
            advance_lineage(state['baseConfig'],result);state['round']+=1
            atomic(output/'status.json',state)
        remaining=max(0,deadline-time.time())
        state.update(running=False,complete=remaining<1,remainingSeconds=remaining,phase='finished' if remaining<1 else 'paused',
                     finishedAt=time.time(),childPid=None)
    except BaseException as error:
        if child and child.poll() is None:(current/'STOP').touch();child.wait()
        state.update(running=False,complete=False,remainingSeconds=max(0,deadline-time.time()),phase='error',error=str(error),finishedAt=time.time(),childPid=None)
        raise
    finally: atomic(output/'status.json',state)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('config',type=Path);p.add_argument('output',type=Path);p.add_argument('--resume',action='store_true')
    a=p.parse_args();run(a.config,a.output,a.resume)
