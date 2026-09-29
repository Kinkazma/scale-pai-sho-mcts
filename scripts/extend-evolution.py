"""Detached finite supervisor: finish archived work, then evolve its descendants.
No live profile publication. STOP is cooperative, games finish in reversed pairs.
"""
import argparse, hashlib, json, os, shutil, signal, subprocess, time
from pathlib import Path

SOURCE_FILES = ['src/engine.mjs', 'src/region-resolution.mjs', 'src/search.mjs',
    'src/search-memory.mjs', 'src/search-profile.json', 'src/mcts-catalog.json',
    'scripts/evolve.mjs', 'scripts/evolution-plan.mjs', 'scripts/evolution-profiles.mjs',
    'scripts/evolution-game.mjs', 'scripts/evolution-worker.mjs', 'scripts/measurement-lock.mjs']

def atomic(file, value):
    temp = file.with_suffix(file.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(file)

def run(root, archive, output, seconds, resume=False):
    previous = json.loads((output/"status.json").read_text()) if resume else None
    if previous:
        try: os.kill(previous["pid"], 0)
        except ProcessLookupError: pass
        else: raise RuntimeError("Supervisor already alive")
    output.mkdir(parents=True, exist_ok=resume)
    runtime = output / 'runtime'
    if resume:
        hashes = json.loads((output/'source-hashes.json').read_text())
        for name, expected in hashes.items():
            if hashlib.sha256((runtime/name).read_bytes()).hexdigest() != expected:
                raise RuntimeError(f'Frozen runtime changed: {name}')
    else:
        for name in SOURCE_FILES:
            dest = runtime / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / name, dest)
        atomic(output / 'source-hashes.json', {f: hashlib.sha256((runtime/f).read_bytes()).hexdigest() for f in SOURCE_FILES})
    started = previous["startedAt"] if previous else time.time(); deadline = previous["deadline"] if previous else started + seconds
    state = dict(pid=os.getpid(), startedAt=started, deadline=deadline, seconds=seconds,
                 running=True, complete=False, rounds=[], publication='No live profile changes')
    stop = False
    def request_stop(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    if previous: state['rounds'] = previous['rounds']
    atomic(output/'status.json', state)
    original = json.loads((archive/'config.json').read_text())
    old_status = json.loads((archive/'status.json').read_text())
    parent = old_status['champion']
    history = [g['ranked'][0]['profile'] for g in old_status.get('generations', [])][-8:]
    child = None; current = archive
    try:
        index = previous.get("round", 0) if previous else 0
        # Reconstruct the lineage without changing an existing round configuration.
        if previous:
            for number in range(index):
                path = archive if number == 0 else output/f'round-{number:03d}'
                done = next((r for r in previous['rounds'] if r['archive'] == str(path) and r['complete']), None)
                if not done: raise RuntimeError(f'Completed round {number} missing from resume history')
                history.append(parent); parent = done['champion']
        while index < 1000:
            remaining = int(deadline - time.time())
            if stop or remaining < 1 or (output/'STOP').exists(): break
            if index == 0:
                current = archive
                script = current/'runtime/scripts/evolve.mjs'
                config = current/'config.json'
            else:
                current = output/f'round-{index:03d}'
                current.mkdir(exist_ok=True)
                config = current/'config.json'
                p = dict(original, seed=original['seed'] + index*100003, maxActiveSeconds=remaining,
                         initialProfile=dict(parent, id=f'parent-round-{index:03d}'),
                         initialHistory=history[-8:])
                if not config.exists(): atomic(config, p)
                script = runtime/'scripts/evolve.mjs'
            state.update(phase='resume-confirmation' if index == 0 else 'evolution', archive=str(current), round=index)
            with (output/f'round-{index:03d}.log').open('ab', buffering=0) as log:
                child = subprocess.Popen(['node', str(script), str(current), str(config)], cwd=runtime,
                                         stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
                state['childPid'] = child.pid; atomic(output/'status.json', state)
                while child.poll() is None:
                    if stop or time.time() >= deadline or (output/'STOP').exists():
                        (current/'STOP').touch()
                    state['observedAt'] = time.time()
                    progress = current/'status.json'
                    if progress.exists(): state['progress'] = json.loads(progress.read_text())
                    atomic(output/'status.json', state)
                    time.sleep(2)
            if child.returncode != 0: raise RuntimeError(f'Round {index} exited with code {child.returncode}; inspect its log')
            result = json.loads((current/'status.json').read_text())
            state['rounds'] = [r for r in state['rounds'] if r['archive'] != str(current)]
            state['rounds'].append(dict(archive=str(current), complete=result['complete'], champion=result['champion']))
            atomic(output/'status.json', state)
            child = None
            if not result['complete']:
                if stop or time.time() >= deadline or (output/'STOP').exists(): break
                if (current/'STOP').exists(): raise RuntimeError('Archive STOP requires explicit resolution')
                continue
            history.append(parent);parent = result['champion']
            index += 1
        state.update(running=False, complete=True, phase='stopped' if stop else 'finished', finishedAt=time.time(), childPid=None)
    except BaseException as error:
        if child and child.poll() is None:
            (current/'STOP').touch();child.wait()
        state.update(running=False, complete=False, phase='error', error=str(error), finishedAt=time.time())
        raise
    finally:
        atomic(output/'status.json', state)

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('output',type=Path);p.add_argument('--seconds',type=int,default=7200);p.add_argument('--resume',action='store_true')
    a=p.parse_args()
    if not 1<=a.seconds<=86400: p.error('seconds must be 1..86400')
    run(Path(__file__).resolve().parents[1],a.archive.resolve(),a.output.resolve(),a.seconds,a.resume)
