/** Resolve effects from their previous activity, preserving stable mutual states.
 * Missing history is allowed only when the graph determines an unambiguous state.
 * A cyclic dependency graph is not itself a temporal loop.
 */
export function resolveActivity(regions, previous={}){
  const flat=regions.flat(),key=r=>`${r.side}:${r.key??r.vertices.join(',')}`;
  const incoming=flat.map(r=>flat.flatMap((other,j)=>other.side!==r.side&&r.vertices.some(p=>other.inside.includes(p))?[j]:[]));
  let active=flat.map(r=>Object.hasOwn(previous,key(r))?(previous[key(r)]?1:-1):0);
  while(active.includes(0)){
    let progress=false;
    for(let i=0;i<flat.length;i++)if(active[i]===0){
      if(incoming[i].some(j=>active[j]===1)){active[i]=-1;progress=true;}
      else if(incoming[i].every(j=>active[j]===-1)){active[i]=1;progress=true;}
    }
    if(!progress)throw Error('Historique d’activité requis pour ces régions interdépendantes.');
  }
  const history=[active],seen=new Map([[active.join(','),0]]);
  let cycle=null;
  for(;;){
    const next=flat.map((r,i)=>incoming[i].some(j=>active[j]===1)?-1:1);
    if(next.every((s,i)=>s===active[i]))break;
    const repeated=seen.get(next.join(','));
    if(repeated!==undefined){cycle=[...history.slice(repeated),next];active=next;break;}
    seen.set(next.join(','),history.length);history.push(next);active=next;
  }
  const activity=Object.fromEntries(flat.map((r,i)=>[key(r),active[i]===1]));
  return {
    activity,
    cycle:cycle?.map(mask=>flat.filter((r,i)=>mask[i]===1).map(key)),
    regions:regions.map(rs=>rs.map(r=>({...r,status:activity[key(r)]?'active':'suspended',cyclic:false}))),
  };
}
