#!/usr/bin/env python3
"""Package or install the optional closed-campaign state; never starts training."""
import argparse
import hashlib
import json
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path, PurePosixPath

ROOT=Path(__file__).resolve().parents[1]
NAME='scale-history-01.tar.gz'


def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for b in iter(lambda:stream.read(1024**2),b''):h.update(b)
    return h.hexdigest()


def verify(root):
    archive=root/'assets/history';manifest=json.loads((archive/'manifest.json').read_text())
    for name,expected in manifest['files'].items():
        rel=PurePosixPath(name);path=archive/name
        if rel.is_absolute() or '..' in rel.parts or path.is_symlink():raise ValueError('Unsafe historical member')
        if path.stat().st_size!=expected['bytes'] or digest(path)!=expected['sha256']:
            raise ValueError('Historical member changed: '+name)
    return manifest


def pack(root, out):
    manifest=verify(root);out.mkdir(parents=True,exist_ok=True);dest=out/NAME
    if dest.exists():raise ValueError('Archive already exists')
    with tarfile.open(dest,'w:gz',compresslevel=1,format=tarfile.PAX_FORMAT) as archive:
        for name in ['manifest.json',*sorted(manifest['files'])]:
            p=root/'assets/history'/name
            info=tarfile.TarInfo('assets/history/'+name);info.size=p.stat().st_size;info.mode=0o644
            with p.open('rb') as stream:archive.addfile(info,stream)
    if dest.stat().st_size>1800000000:raise ValueError('History archive exceeds release part size')
    catalog={'schema':'scale-history-assets-v1','optional':True,'release_url':None,
             'file':NAME,'bytes':dest.stat().st_size,'sha256':digest(dest),
             'payload_files':len(manifest['files'])+1,
             'manifest_sha256':digest(root/'assets/history/manifest.json')}
    path=root/'data/history-assets.json';path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(catalog,indent=2)+'\n');print(json.dumps(catalog))


def install(root, downloads, url=None):
    catalog=json.loads((ROOT/'data/history-assets.json').read_text());downloads.mkdir(parents=True,exist_ok=True)
    archive=downloads/catalog['file']
    if not archive.exists():
        base=url or catalog['release_url']
        if not base or not base.startswith('https://'):raise ValueError('Supply downloaded archive or its HTTPS Release URL')
        tmp=archive.with_suffix('.download')
        with urllib.request.urlopen(base.rstrip('/')+'/'+catalog['file'],timeout=60) as response,tmp.open('wb') as out:
            shutil.copyfileobj(response,out)
        tmp.replace(archive)
    if archive.stat().st_size!=catalog['bytes'] or digest(archive)!=catalog['sha256']:
        raise ValueError('Archive checksum/size mismatch')
    dest=root/'assets/history'
    if dest.exists():raise ValueError('Installed history already exists; verify it instead of overwriting')
    root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.history-install-',dir=root) as directory:
        stage=Path(directory);seen=set()
        with tarfile.open(archive,'r|gz') as tar:
            for member in tar:
                rel=PurePosixPath(member.name)
                if (rel.is_absolute() or '..' in rel.parts or not member.name.startswith('assets/history/')
                    or not member.isfile() or member.name in seen):raise ValueError('Unsafe/duplicate TAR member')
                seen.add(member.name);target=stage/rel;target.parent.mkdir(parents=True,exist_ok=True)
                with tar.extractfile(member) as source,target.open('wb') as out:shutil.copyfileobj(source,out)
        if digest(stage/'assets/history/manifest.json')!=catalog['manifest_sha256']:raise ValueError('Manifest checksum mismatch')
        manifest=verify(stage)
        expected={'assets/history/manifest.json',*['assets/history/'+p for p in manifest['files']]}
        if seen!=expected:raise ValueError('Incomplete or additional archive members')
        dest.parent.mkdir(exist_ok=True);(stage/'assets/history').rename(dest)
    print(json.dumps({'installed':True,'files':len(seen)}))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['pack','install','verify'])
    p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--from-dir',type=Path,default=ROOT/'packs')
    p.add_argument('--base-url');a=p.parse_args()
    if a.command=='pack':pack(a.root,a.from_dir)
    elif a.command=='verify':print(json.dumps({'verified_files':len(verify(a.root)['files'])}))
    else:install(a.root,a.from_dir,a.base_url)
