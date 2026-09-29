"""OS-held allocation lock: concurrent budget lanes cannot lose family indices."""
import fcntl,json,os,sys
from pathlib import Path

def register(ledger,archive,requested=None):
    ledger=Path(ledger);ledger.parent.mkdir(parents=True,exist_ok=True);key=str(Path(archive).resolve())
    with Path(str(ledger)+'.flock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        records=json.loads(ledger.read_text()) if ledger.exists() else {}
        if key in records:
            if requested is not None and requested!=records[key]:raise ValueError('Family index changed on resume')
            return records[key]
        if Path(str(ledger)+'.sequential-transfer.json').exists():raise ValueError('Remaining risk transferred to sequential validation; no new legacy family')
        index=requested if requested is not None else max([0,*records.values()])+1
        if type(index) is not int or index<1 or index in records.values():raise ValueError('Family index already used or invalid')
        records[key]=index;temp=Path(str(ledger)+f'.{os.getpid()}.tmp')
        temp.write_text(json.dumps(records,indent=2)+'\n');temp.replace(ledger)
        return index

if __name__=='__main__':print(register(sys.argv[1],sys.argv[2],json.loads(sys.argv[3])))
