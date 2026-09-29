import {analyze,score,cumulativeScore,sideToMove,coordinate} from './replay-engine.mjs';
const names=['Jade','Ambre'];
const detailsCache=new WeakMap();
const regionId=r=>`${r.side}:${r.key}`;
const regionLabel=r=>`${names[r.side]} (${r.vertices.map(coordinate).join(' ; ')})`;
export function stepDetails(before,after,action){
 const cached=detailsCache.get(after);if(cached?.before===before&&cached.action===action)return cached.value;
 const actor=before.setup?.side??before.ply%2,decision=sideToMove(before);
 const title=action[0]==='finish-setup'?'Fin de l’installation':action[0]==='region'?'Déclaration de triangle':action[0]==='decline'?'Refus des triangles proposés':action[0]==='end-turn'?'Fin du tour':action[0]<0?'Pose d’une tuile':'Déplacement d’une tuile';
 const old=analyze(before),next=analyze(after),oldRegions=new Map(old.regions.flat().map(r=>[regionId(r),r])),newRegions=new Map(next.regions.flat().map(r=>[regionId(r),r]));
 const changes=[],changedRegions=[];
 for(const [id,r]of newRegions){const previous=oldRegions.get(id);if(!previous){changes.push(`${regionLabel(r)} : créé ${r.status==='active'?'actif':'suspendu'}.`);changedRegions.push(r);}else if(previous.status!==r.status){changes.push(`${regionLabel(r)} : ${r.status==='active'?'réactivé':'suspendu'}.`);changedRegions.push(r);}}
 for(const [id,r]of oldRegions)if(!newRegions.has(id)){changes.push(`${regionLabel(r)} : disparu.`);changedRegions.push({...r,removed:true});}
 const newlyFrozen=[...next.frozen].filter(p=>!old.frozen.has(p)),freed=[...old.frozen].filter(p=>!next.frozen.has(p));
 if(newlyFrozen.length)changes.push(`Pièces immobilisées : ${newlyFrozen.map(coordinate).join(' ; ')}.`);
 if(freed.length)changes.push(`Pièces libérées : ${freed.map(coordinate).join(' ; ')}.`);
 const from=score(before).scores,to=score(after).scores;
 const scores=to.map((s,i)=>({side:i,total:s.total-from[i].total,influence:s.influence-from[i].influence,regions:s.regions-from[i].regions,prisoners:s.prisoners-from[i].prisoners}));
 const oldMatch=cumulativeScore(before),newMatch=cumulativeScore(after),scoredTurns=newMatch.turns-oldMatch.turns;
 const credits=newMatch.scores.map((s,i)=>s.total-oldMatch.scores[i].total);
 if(scoredTurns)changes.push(`Décompte du tour : Jade +${credits[0]}, Ambre +${credits[1]} au cumul.`);
 const physical=typeof action[0]==='number';
 const noEffect=!physical&&!changes.length&&scores.every(s=>s.total===0);
 const value={title,setup:!!before.setup,turn:Math.floor(before.ply/2)+1,actor,decision,physical,noEffect,changes,changedRegions,scores,credits,scoredTurns};
 detailsCache.set(after,{before,action,value});return value;
}
export function notableSteps(states,actions){
 return actions.flatMap((action,i)=>{const d=stepDetails(states[i],states[i+1],action);return d.physical||d.changes.length||d.scores.some(s=>s.total!==0)?[i+1]:[];});
}
