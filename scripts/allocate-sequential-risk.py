"""Transfer the unused historical family error budget once, under the old lock."""
import argparse,fcntl,json,os,tempfile
from pathlib import Path

def transfer(ledger,root,budgets):
    ledger=ledger.resolve();root=root.resolve();root.mkdir(parents=True,exist_ok=True)
    with Path(str(ledger)+'.flock').open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        marker=Path(str(ledger)+'.sequential-transfer.json');dest=root/'allocation.json'
        if marker.exists():
            value=json.loads(marker.read_text())
            if value['root']!=str(root) or sorted(map(int,value['budgets']))!=sorted(budgets):raise ValueError('Risk already transferred elsewhere')
        else:
            records=json.loads(ledger.read_text()) if ledger.exists() else {}
            last=max(records.values(),default=0);remaining=.05/(last+1)
            value=dict(protocol='scale-sequential-risk-transfer-v1',root=str(root),historicalLedger=str(ledger),lastReservedFamily=last,
                       remainingRisk=remaining,budgets={str(b):remaining/len(budgets) for b in budgets})
            tmp=Path(str(marker)+'.tmp');tmp.write_text(json.dumps(value,indent=2)+'\n');tmp.replace(marker)
        if dest.exists() and json.loads(dest.read_text())!=value:raise ValueError('Allocation changed')
        tmp=Path(str(dest)+'.tmp');tmp.write_text(json.dumps(value,indent=2)+'\n');tmp.replace(dest)
        return value
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('ledger',type=Path);p.add_argument('root',type=Path);p.add_argument('budgets',type=int,nargs='+');a=p.parse_args()
    if len(set(a.budgets))!=len(a.budgets) or not a.budgets:raise ValueError('Distinct budgets required')
    print(json.dumps(transfer(a.ledger,a.root,a.budgets)))
