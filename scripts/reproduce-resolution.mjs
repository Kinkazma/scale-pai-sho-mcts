import fs from 'node:fs';
import {initialState,playLegal,outcome} from '../src/engine.mjs';
import {search} from '../src/search.mjs';
let s=initialState(70),actions=[],seen=new Map(),turn=-1;
for(let n=0;n<5001;n++){
 if(outcome(s)){console.log('Finished',n);break;}
 if(s.ply!==turn){seen.clear();turn=s.ply;}
 const key=JSON.stringify(s);
 if(seen.has(key)){
  const start=seen.get(key);console.log(JSON.stringify({repeatFrom:start,repeatAt:n,ply:s.ply,cycle:actions.slice(start),state:s}));
  fs.writeFileSync('browser-lab/regions/artifacts/resolution-cycle.json',JSON.stringify({seed:31007070,turnLimit:70,start,actions,state:s},null,2));break;
 }
 seen.set(key,n);
 const result=search(s,128,31007070n+BigInt(n)*1000003n);s=playLegal(s,result.action);actions.push(result.action);
 if(n%100===0)console.log(JSON.stringify({n,ply:s.ply}));
}
