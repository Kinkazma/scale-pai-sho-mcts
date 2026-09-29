/** Frozen Scale profiles. Generation and simulation budget are independent choices. */
import catalog from './ai-generations.json' with {type:'json'};
export const GENERATIONS=catalog.generations;
export const DEFAULT_GENERATION=catalog.defaultGeneration;
export const DEFAULT_BUDGET=catalog.defaultBudget;
export function generationBudgets(generation){
 const entry=GENERATIONS.find(g=>g.id===Number(generation));
 if(!entry)throw Error('Unknown generation.');
 return Object.keys(entry.profiles).map(Number).sort((a,b)=>a-b);
}
export function generationProfile(budget,generation=DEFAULT_GENERATION){
 const p=GENERATIONS.find(g=>g.id===Number(generation))?.profiles[String(budget)];
 if(!p)throw Error('Budget unavailable for this generation.');
 return structuredClone(p);
}
export function gameAgents(players,generations,seed){
 return {players:[...players],generations:players.map((p,i)=>p==='human'?null:Number(generations[i])),seed:String(seed),
  profiles:players.map((p,i)=>p==='human'?null:generationProfile(Number(p),generations[i]))};
}
export function restoreAgents(agents={},fallbackPlayers=['human','32']){
 const players=(agents.players??fallbackPlayers).map(String),generations=players.map((p,i)=>{
  if(p==='human')return null;
  if(agents.generations?.[i])return Number(agents.generations[i]);
  if(agents.profiles?.[i])return GENERATIONS.find(g=>JSON.stringify(g.profiles[p])===JSON.stringify(agents.profiles[i]))?.id??null;
  return 1; // Journals predating generation selection used the legacy catalogue.
 });
 return {...agents,players,generations,seed:String(agents.seed??'1'),profiles:players.map((p,i)=>p==='human'?null:
  structuredClone(agents.profiles?.[i]??generationProfile(Number(p),generations[i]??1)))};
}
