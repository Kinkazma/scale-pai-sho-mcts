"""Independent scheduling, fixed deadline, reference admission and parallel allocation."""
import concurrent.futures,importlib.util,json,subprocess,tempfile,time,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
independent=module('run-independent-campaign');supervisor=module('run-relational-campaign')

class IndependentTest(unittest.TestCase):
    def test_one_lane_failure_does_not_stop_other_lane(self):
        # A bounded scheduler fixture: failed 8 and healthy 32 share no barrier.
        with tempfile.TemporaryDirectory() as folder:
            tmp=Path(folder);root=tmp/'source';scripts=root/'scripts';scripts.mkdir(parents=True)
            (scripts/'run-independent-campaign.py').write_bytes((ROOT/'scripts/run-independent-campaign.py').read_bytes())
            (scripts/'evolution-relational-plan.mjs').write_text('export const options=x=>x;')
            (scripts/'relational-sources.mjs').write_text("export const SOURCES=['scripts/run-relational-campaign.py'];")
            (scripts/'run-relational-campaign.py').write_text('''import json,sys,time
from pathlib import Path
c=json.loads(Path(sys.argv[1]).read_text());out=Path(sys.argv[2]);out.mkdir()
if c['budgets']==[8]:sys.exit(3)
count=0
while time.time()<c['absoluteDeadline'] and not (out/'STOP').exists():count+=1;time.sleep(.05)
(out/'status.json').write_text(json.dumps({'phase':'finished','round':count,'progress':{}}))
''')
            config=tmp/'config.json';output=tmp/'run'
            config.write_text(json.dumps(dict(budgets=[8,32],workers=10,maxActiveSeconds=3,familyRegistry=str(tmp/'ledger.json'))))
            subprocess.run(['python3',str(scripts/'run-independent-campaign.py'),str(config),str(output)],check=True,timeout=10)
            state=json.loads((output/'status.json').read_text())
            self.assertEqual(state['phase'],'error');self.assertIn('Budget 8 failed',state['error'])
            self.assertGreaterEqual(state['lanes']['32']['round'],40)
            self.assertFalse((output/'budget-32/STOP').exists() and state['finishedAt']<state['deadline'])

    def test_workers_and_reference_admission(self):
        self.assertEqual(independent.worker_allocation([8,32],10),{'8':5,'32':5})
        self.assertEqual(independent.worker_allocation([8,32],5),{'8':3,'32':2})
        with self.assertRaises(ValueError):independent.worker_allocation([8,32],1)
        config={'seed':5,'advanceTrainingReferences':True,'referencesByBudget':{'8':{'id':'old'}}}
        result={'complete':False,'history':{'8':[]},'elites':{'8':[{'id':'new'}]},'champions':{'8':{'id':'new'}},'assessment':[{'budget':8,'eligible':True}]}
        supervisor.advance_lineage(config,result);self.assertEqual(config['referencesByBudget']['8']['id'],'old')
        result.update(complete=True);result['assessment'][0]['eligible']=False
        supervisor.advance_lineage(config,result);self.assertEqual(config['referencesByBudget']['8']['id'],'old')
        result['assessment'][0]['eligible']=True;supervisor.advance_lineage(config,result)
        self.assertEqual(config['referencesByBudget']['8']['id'],'new');self.assertEqual(config['seed'],300014)

    def test_frozen_reference_pool_never_advances_after_acceptance(self):
        original={'8':[{'label':'G1','profile':{'id':'first'}},{'label':'G3','profile':{'id':'frozen'}}]}
        config={'seed':5,'advanceTrainingReferences':True,'referencePoolByBudget':original,'referencesByBudget':{'8':{'id':'frozen'}}}
        result={'complete':True,'history':{'8':[]},'elites':{'8':[{'id':'child'}]},'champions':{'8':{'id':'child'}},'acceptedProfiles':{'8':{'id':'child'}},'assessment':[{'budget':8,'eligible':True}]}
        supervisor.advance_lineage(config,result)
        self.assertEqual(config['referencePoolByBudget'],original)
        self.assertEqual(config['referencesByBudget']['8']['id'],'frozen')
        self.assertEqual(config['initialParentsByBudget']['8'][0]['id'],'child')

    def test_concurrent_family_allocation(self):
        with tempfile.TemporaryDirectory() as folder:
            tmp=Path(folder);ledger=tmp/'families.json';ledger.write_text(json.dumps({'old-a':1,'old-b':2}))
            def allocate(i):
                return int(subprocess.check_output(['python3',str(ROOT/'scripts/family-registry.py'),str(ledger),str(tmp/f'run-{i}'),'null']))
            with concurrent.futures.ThreadPoolExecutor(10) as pool:indices=list(pool.map(allocate,range(20)))
            self.assertEqual(set(indices),set(range(3,23)))
            with concurrent.futures.ThreadPoolExecutor(10) as pool:self.assertEqual(list(pool.map(allocate,range(20))),indices)
            self.assertEqual(len(json.loads(ledger.read_text())),22)

    def test_real_pools_pause_resume_and_absolute_deadline(self):
        with tempfile.TemporaryDirectory(prefix='scale-independent-') as folder:
            tmp=Path(folder);config=tmp/'config.json';output=tmp/'run';process=None
            config.write_text(json.dumps(dict(generations=1,offspring=1,selectionPairsPerBudget=2,
                confirmationPairsPerBudget=1,budgets=[8,32],limits=[15],workers=10,seed=4349,
                maxActiveSeconds=120,familyRegistry=str(tmp/'families.json'))))
            def launch(resume=False):
                return subprocess.Popen(['python3',str(ROOT/'scripts/run-independent-campaign.py'),str(config),str(output)]+(['--resume'] if resume else []),stdout=log,stderr=log)
            def game_counts():return {b:len(list((output/f'budget-{b}').glob('round-*/games/*.json'))) for b in [8,32]}
            def await_games(previous):
                deadline=time.monotonic()+90
                while time.monotonic()<deadline:
                    if all(game_counts()[b]>previous[b] for b in [8,32]):return
                    if process.poll() is not None:self.fail('Independent run failed: '+(tmp/'run.log').read_text())
                    time.sleep(.1)
                self.fail('Both pools failed to make progress')
            with (tmp/'run.log').open('w') as log:
                try:
                    process=launch();await_games({8:0,32:0});process.terminate();self.assertEqual(process.wait(90),0)
                    first=json.loads((output/'status.json').read_text());self.assertEqual(first['phase'],'paused')
                    self.assertEqual(first['workers'],10)
                    for b in [8,32]:
                        lane=json.loads((output/f'budget-{b}-config.json').read_text())
                        self.assertEqual(lane['workers'],5);self.assertEqual(lane['absoluteDeadline'],first['deadline'])
                    original={str(p):p.read_bytes() for p in output.glob('budget-*/round-*/games/*.json')}
                    counts=game_counts();process=launch(True);await_games(counts);process.terminate();self.assertEqual(process.wait(90),0)
                    second=json.loads((output/'status.json').read_text());self.assertEqual(second['deadline'],first['deadline'])
                    self.assertLess(second['remainingSeconds'],first['remainingSeconds'])
                    for name,body in original.items():self.assertEqual(Path(name).read_bytes(),body)
                    second['deadline']=time.time()-1;(output/'status.json').write_text(json.dumps(second))
                    process=launch(True);self.assertNotEqual(process.wait(10),0)
                finally:
                    if process and process.poll() is None:process.terminate();process.wait(90)

if __name__=='__main__':unittest.main()
