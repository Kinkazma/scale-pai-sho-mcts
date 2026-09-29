import fs from 'node:fs';

export function acquireMeasurementLock(file){
  try{fs.writeFileSync(file,String(process.pid),{flag:'wx'});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const owner=Number(fs.readFileSync(file,'utf8'));
    if(!Number.isSafeInteger(owner)||owner<=1)throw Error(`Unrecognized measurement lock: ${file}`);
    let alive=true;
    try{process.kill(owner,0);}catch(probe){if(probe.code==='ESRCH')alive=false;else throw probe;}
    if(alive)throw Error(`Measurements already running (PID ${owner})`);
    fs.unlinkSync(file);
    fs.writeFileSync(file,String(process.pid),{flag:'wx'});
  }
  return ()=>{
    if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===String(process.pid))fs.unlinkSync(file);
  };
}
