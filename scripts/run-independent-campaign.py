"""Independent budget lineages and worker pools; one fixed campaign deadline."""
import argparse,hashlib,json,os,signal,subprocess,sys,time
from pathlib import Path

def read(p):return json.loads(p.read_text())
def atomic(p,obj):
    tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n');tmp.replace(p)
def alive(pid):
    if not pid:return False
    try:os.kill(pid,0);return True
    except ProcessLookupError:return False

def worker_allocation(budgets,total):
    if type(total) is not int or total<len(budgets) or total>64:raise ValueError('At least one worker per lane; at most 64 total')
    return {str(b):total//len(budgets)+(i<total%len(budgets)) for i,b in enumerate(budgets)}

def refresh_lane(lane):
    file=Path(lane['archive'])/'status.json'
    if file.exists():
        s=read(file);progress=s.get('progress',{})
        lane.update(phase=s.get('phase'),round=s.get('round'),completedThisRound=progress.get('completedThisRun',0),generation=progress.get('generation'),stage=progress.get('stage'),error=s.get('error'),childPid=s.get('childPid'))

def run(config_path,output,resume=False):
    output=output.resolve();root=Path(__file__).resolve().parents[1]
    if resume:
        state=read(output/'status.json')
        if alive(state.get('pid')) or any(alive(x.get('pid')) for x in state['lanes'].values()):raise RuntimeError('Previous independent campaign still alive')
        if time.time()>=state['deadline']:raise RuntimeError('Authorized deadline has expired')
        for name,sha in read(output/'source-hashes.json').items():
            if hashlib.sha256((output/'runtime'/name).read_bytes()).hexdigest()!=sha:raise RuntimeError('Frozen source changed: '+name)
        (output/'STOP').unlink(missing_ok=True)
    else:
        config=read(config_path);budgets=config['budgets'];duration=config['maxActiveSeconds']
        if not budgets or len(set(budgets))!=len(budgets):raise ValueError('Distinct budget lanes required')
        if not isinstance(duration,int) or not 1<=duration<=129600:raise ValueError('Duration outside authorized maximum')
        allocation=worker_allocation(budgets,config.get('workers',2))
        config['familyRegistry']=str(Path(config['familyRegistry']).resolve())
        # Validate references and parents before creating a campaign.
        subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs';import {options} from './scripts/evolution-relational-plan.mjs';options(JSON.parse(fs.readFileSync(process.argv[1])))",str(config_path.resolve())],cwd=root,check=True)
        output.mkdir(parents=True,exist_ok=False)
        names=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {SOURCES} from './scripts/relational-sources.mjs';console.log(JSON.stringify(SOURCES))"],cwd=root,text=True))
        hashes={}
        for name in names:
            body=(root/name).read_bytes();dest=output/'runtime'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(body);hashes[name]=hashlib.sha256(body).hexdigest()
        atomic(output/'source-hashes.json',hashes);atomic(output/'original-config.json',config)
        # One new shared registry for this campaign, seeded with already spent indices.
        ledger=Path(config['familyRegistry']);atomic(output/'family-ledger-at-start.json',read(ledger) if ledger.exists() else {})
        started=time.time();deadline=started+duration
        state=dict(protocol='independent-budget-campaign-v1',startedAt=started,deadline=deadline,lanes={},authorizedSeconds=duration,workers=sum(allocation.values()),publication='Training references only; played catalogue unchanged')
        for budget in budgets:
            lane={**config,'budgets':[budget],'workers':allocation[str(budget)],'absoluteDeadline':deadline}
            for k in ['initialParentsByBudget','initialHistoryByBudget','referencesByBudget','referencePoolByBudget']:
                if k in lane:lane[k]={str(budget):lane[k][str(budget)]}
            file=output/f'budget-{budget}-config.json';atomic(file,lane)
            state['lanes'][str(budget)]={'budget':budget,'workers':allocation[str(budget)],'config':str(file),'archive':str(output/f'budget-{budget}'),'pid':None}
        atomic(output/'status.json',state)
    state.update(pid=os.getpid(),running=True,phase='running',error=None);atomic(output/'status.json',state)
    stopped=False;children={};logs={}
    def stop(*_):
        nonlocal stopped
        stopped=True
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    def request_lane_stop(lane):
        folder=Path(lane['archive'])
        # The lane creates its directory exclusively. Never race that creation.
        if folder.exists():(folder/'STOP').touch()
    try:
        for key,lane in state['lanes'].items():
            folder=Path(lane['archive']);saved=read(folder/'status.json') if (folder/'status.json').exists() else None
            if saved and (saved.get('phase')=='finished' or saved.get('remainingSeconds',0)<1):continue
            if saved and (alive(saved.get('pid')) or alive(saved.get('childPid'))):raise RuntimeError('Budget lane still alive')
            log=(output/f'budget-{key}.log').open('ab',buffering=0);logs[key]=log
            args=[sys.executable,str(output/'runtime/scripts/run-relational-campaign.py'),lane['config'],lane['archive']]
            if saved:args.append('--resume')
            child=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,cwd=output/'runtime')
            children[key]=child;lane['pid']=child.pid;atomic(output/'status.json',state)
        while any(c.poll() is None for c in children.values()):
            now=time.time();must_stop=stopped or now>=state['deadline'] or (output/'STOP').exists()
            for key,lane in state['lanes'].items():
                refresh_lane(lane)
                child=children.get(key)
                if child and child.poll() not in [None,0]:
                    state['error']=f'Budget {key} failed ({child.returncode}); other lanes continue'
                if must_stop and child and child.poll() is None:request_lane_stop(lane)
            state.update(observedAt=now,remainingSeconds=max(0,state['deadline']-now));atomic(output/'status.json',state);time.sleep(1)
        for key,child in children.items():
            refresh_lane(state['lanes'][key])
            if child.returncode!=0:state['error']=f'Budget {key} failed ({child.returncode}); other lanes continued'
        state.update(running=False,finishedAt=time.time(),remainingSeconds=max(0,state['deadline']-time.time()),phase='error' if state['error'] else 'finished' if time.time()>=state['deadline'] else 'paused')
    except BaseException as e:
        while any(c.poll() is None for c in children.values()):
            for key,child in children.items():
                if child.poll() is None:request_lane_stop(state['lanes'][key])
            time.sleep(.1)
        for child in children.values():child.wait()
        state.update(running=False,phase='error',error=str(e),finishedAt=time.time(),remainingSeconds=max(0,state['deadline']-time.time()));raise
    finally:
        for log in logs.values():log.close()
        atomic(output/'status.json',state)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('config',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--resume',action='store_true');a=parser.parse_args();run(a.config,a.output,a.resume)
