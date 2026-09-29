"""Real cooperative pause/resume, immutable journals and bounded wall time."""
import hashlib, json, subprocess, tempfile, time, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class SupervisorTest(unittest.TestCase):
    def test_pause_and_resume(self):
        with tempfile.TemporaryDirectory(prefix='scale-supervisor-') as folder:
            tmp=Path(folder);config=tmp/'config.json';output=tmp/'run';process=None
            config.write_text(json.dumps(dict(generations=1,offspring=1,
                selectionPairsPerBudget=2,confirmationPairsPerBudget=1,budgets=[8],
                limits=[15],workers=1,seed=4349,maxActiveSeconds=120,
                familyRegistry=str(tmp/'families.json'))))
            def launch(resume=False):
                script=output/'runtime/scripts/run-relational-campaign.py' if resume else ROOT/'scripts/run-relational-campaign.py'
                return subprocess.Popen(['python3',str(script),str(config),str(output)]+(['--resume'] if resume else []),
                                        stdout=subprocess.DEVNULL,stderr=log)
            def wait_games(count):
                deadline=time.monotonic()+75
                while time.monotonic()<deadline:
                    if len(list((output/'round-000/games').glob('*.json')))>=count:return
                    if process.poll() is not None: self.fail('Supervisor exited before requested games')
                    time.sleep(.1)
                self.fail('Game deadline exceeded')
            with (tmp/'supervisor.log').open('w') as log:
                try:
                    process=launch();wait_games(2);process.terminate();self.assertEqual(process.wait(60),0)
                    first=json.loads((output/'status.json').read_text());self.assertEqual(first['phase'],'paused')
                    self.assertGreater(first['remainingSeconds'],0);self.assertLess(first['remainingSeconds'],120)
                    games={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (output/'round-000/games').glob('*.json')}
                    self.assertEqual(len(games)%2,0)
                    family=json.loads((tmp/'families.json').read_text())
                    process=launch(True);wait_games(len(games)+2);process.terminate();self.assertEqual(process.wait(60),0)
                    second=json.loads((output/'status.json').read_text())
                    self.assertLess(second['remainingSeconds'],first['remainingSeconds'])
                    self.assertEqual(json.loads((tmp/'families.json').read_text()),family)
                    for p,h in games.items():self.assertEqual(hashlib.sha256(Path(p).read_bytes()).hexdigest(),h)
                    # An unclean, expired run cannot recover its old remaining duration.
                    second.update(running=True,deadline=time.time()-1,remainingSeconds=120)
                    (output/'status.json').write_text(json.dumps(second))
                    process=launch(True);self.assertNotEqual(process.wait(10),0)
                finally:
                    if process is not None and process.poll() is None:process.terminate();process.wait(60)

if __name__=='__main__':unittest.main()
