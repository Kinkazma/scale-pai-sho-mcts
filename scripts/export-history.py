#!/usr/bin/env python3
"""Export a closed Scale campaign, frozen sources and spent validation evidence.

Maintainer tool. Source paths are supplied explicitly and are never recorded in
the public manifest. This does not start or modify the source campaign.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path

STRING = re.compile(rb'"(?:[^"\\]|\\.)*"')
TOKEN = '@history/'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def export(source, campaign, output):
    source, campaign, output = source.resolve(), campaign.resolve(), output.resolve()
    if output.exists() or not campaign.is_relative_to(source):
        raise ValueError('New export directory and a campaign inside the source tree required')
    if not (campaign/'CLOSED.json').is_file():
        raise ValueError('Only a deliberately closed campaign may be exported')
    config = json.loads((campaign/'original-config.json').read_text())
    files = set()
    for parent, dirs, names in os.walk(campaign):
        dirs[:] = [d for d in dirs if d != 'runtime']
        files.update(Path(parent)/n for n in names if n.endswith('.json'))
    frozen = [campaign, *[campaign/f'budget-{b}' for b in config['budgets']]]
    for folder in frozen:
        for name, expected in json.loads((folder/'source-hashes.json').read_text()).items():
            p = folder/'runtime'/name
            if digest(p.read_bytes()) != expected:
                raise ValueError('Frozen runtime changed: '+name)
            files.add(p)
    registry = Path(config['familyRegistry'])
    files.add(registry)
    files.update(registry.parent.glob(registry.name+'.sequential-transfer.json'))
    validation = Path(config['sequentialValidation']['root'])
    files.update(validation.glob('*.json'))
    # Actual journals behind ALL spent validation pairs, including earlier runs.
    for ledger in validation.glob('budget-*.json'):
        for dossier in json.loads(ledger.read_text())['dossiers'].values():
            for pair in dossier['pairs']:
                for receipt in pair['games']:
                    p = Path(receipt['path'])
                    if digest(p.read_bytes()) != receipt['sha256']:
                        raise ValueError('Validation evidence changed')
                    files.add(p)
    # Resolve referenced source files (lineage status, manifests, closure record).
    done = set()
    while files-done:
        for p in list(files-done):
            if not p.is_relative_to(source) or p.is_symlink():
                raise ValueError('Dependency outside the source tree')
            done.add(p)
            if p.suffix != '.json':
                continue
            for match in STRING.finditer(p.read_bytes()):
                value = json.loads(match[0])
                if value.startswith(str(source)+'/') and Path(value).is_file():
                    files.add(Path(value))
                elif value.startswith('reports/') and '..' not in Path(value).parts and (source/value).is_file():
                    files.add(source/value)
    output.mkdir(parents=True)
    manifest = {}
    for p in sorted(files):
        raw = p.read_bytes()
        def neutral(match):
            value = json.loads(match[0])
            if value.startswith(str(source)+'/'):
                return json.dumps(TOKEN+str(Path(value).relative_to(source))).encode()
            if '/Users/' in value or '/Volumes/' in value:
                raise ValueError('Unmapped private path')
            return match[0]
        body = STRING.sub(neutral, raw) if p.suffix == '.json' else raw
        if b'/Users/' in body or b'/Volumes/' in body:
            raise ValueError('Private source path remains')
        dest = output/p.relative_to(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        manifest[str(p.relative_to(source))] = {'sha256': digest(body), 'bytes': len(body),
                                               'source_sha256': digest(raw)}
    receipt = {'schema':'scale-historical-export-v1', 'campaign':str(campaign.relative_to(source)),
               'family_registry':str(registry.relative_to(source)),
               'validation_root':str(validation.relative_to(source)),
               'files':manifest, 'automatic_resume':False,
               'scope':'Closed campaign rounds, exact frozen runtime, lineages and every spent sequential validation journal. Historical transaction hashes are source provenance; paths have been anonymized.'}
    (output/'manifest.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({'files':len(files),'bytes':sum(x['bytes'] for x in manifest.values())}))


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path);p.add_argument('campaign',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();export(a.source,a.campaign,a.output)
