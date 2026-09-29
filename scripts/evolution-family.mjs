import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
/** Stable ledger format, process-held lock shared by independent budget lanes.
 * Python is also the campaign supervisor runtime; no third-party dependency.
 * Old frozen campaigns must not allocate against this ledger concurrently. */
export function registerFamily(ledger,archive,requested=null){
 const result=spawnSync('python3',[fileURLToPath(new URL('./family-registry.py',import.meta.url)),
  path.resolve(ledger),path.resolve(archive),JSON.stringify(requested)],{encoding:'utf8',timeout:10000});
 if(result.error||result.status!==0)throw Error(result.error?.message||result.stderr.trim()||'Family allocation failed');
 const index=Number(result.stdout.trim());if(!Number.isSafeInteger(index)||index<1)throw Error('Invalid family allocation');
 return index;
}
