import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
history=load('continue-history');assets=load('history-assets')

class History(unittest.TestCase):
    def test_paths_and_dictionary_keys_move_without_rounding_weights(self):
        raw=b'{"@history/reports/a": "@history/reports/b", "weight":1.234567890123456789}'
        result=history.localize(raw,Path('/new/project'))
        self.assertEqual(result,b'{"/new/project/reports/a": "/new/project/reports/b", "weight":1.234567890123456789}')
        with self.assertRaises(ValueError):history.localize(b'"@history/../../outside"',Path('/new'))

    def test_duration_cannot_be_granted_twice(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'restoration.json').write_text('{"started":true}')
            with self.assertRaisesRegex(ValueError,'already started'):history.run(root)

    def test_archive_damage_is_rejected_before_restoration(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);archive=root/'assets/history';archive.mkdir(parents=True)
            (archive/'record.json').write_text('wrong')
            (archive/'manifest.json').write_text(json.dumps({'files':{'record.json':{'bytes':5,'sha256':'0'*64}}}))
            with self.assertRaisesRegex(ValueError,'changed'):assets.verify(root)

if __name__=='__main__':unittest.main()
