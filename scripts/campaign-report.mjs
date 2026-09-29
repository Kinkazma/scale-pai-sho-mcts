import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {summarize} from './calibration-stats.mjs';

const [output,...directories]=process.argv.slice(2);
if(!output||!directories.length)throw Error('Expected OUTPUT_DIRECTORY CAMPAIGN_DIRECTORY...');
fs.mkdirSync(output,{recursive:true});
const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const pct=value=>value==null?'—':`${(100*value).toFixed(1)} %`;
const context=g=>g.options.hemispheres?`Jade au ${g.options.jadeHemisphere==='north'?'nord':'sud'}`:'Libre';
const rows=[['campagne','partie','paire','graine','tours','contexte','budget_jade','profil_jade','budget_ambre','profil_ambre','vainqueur','raison','score_jade','score_ambre','decisions','secondes','sha256','journal']];
const text=['# Mesures des MCTS fixes — règles V10','',
  'Données produites par les campagnes indiquées ci-dessous. Un rapport partiel ne constitue ni un classement définitif ni une étude d’équilibre achevée. Les budgets désignent des simulations par décision, pas une force garantie.',''];
for(const directory of directories){
  const reportFile=path.join(directory,'report.json');
  if(!fs.existsSync(reportFile))continue;
  const report=JSON.parse(fs.readFileSync(reportFile)),name=path.basename(path.resolve(directory));
  const games=report.games??[],planned=report.plan.games??report.plan.jobs.length;
  text.push(`## ${name}`,'',`État : **${report.complete?'terminé':'partiel'}**, ${games.length}/${planned} parties. Règles : ${report.plan.rules}.`,'');
  if(report.profiles){
    text.push('Sélection exploratoire : quatre parties par profil et par budget. Ces observations servent à proposer des candidats ; elles ne démontrent pas leur supériorité.','',
      '| Profil candidat | Budget | Victoires | Nulles | Défaites | Points / parties |','|---|---:|---:|---:|---:|---:|');
    for(const row of report.profiles)for(const b of row.byBudget)text.push(`| ${row.profile.id} | ${b.budget} | ${b.wins} | ${b.draws} | ${b.losses} | ${pct(b.scoreRate)} |`);
    text.push('');
  }else if(report.plan.protocol==='regions-fixed-verification-v1'){
    text.push('Validation sur des graines distinctes, cinq durées et trois contextes. Le candidat est retenu seulement s’il obtient plus de la moitié des points sur ses 30 parties de validation. Cette règle de sélection reste une décision empirique sur un échantillon limité.','',
      '| Budget | Candidat | Parties | Victoires | Nulles | Défaites | Points / parties |','|---:|---|---:|---:|---:|---:|---:|');
    for(const budget of report.plan.budgets){
      const subset=games.filter(g=>g.budget===budget),wins=subset.filter(g=>g.result.winner===g.candidateSide).length,draws=subset.filter(g=>g.result.winner===null).length;
      text.push(`| ${budget} | ${report.plan.proposals[budget].id} | ${subset.length} | ${wins} | ${draws} | ${subset.length-wins-draws} | ${pct(subset.length?(wins+draws/2)/subset.length:null)} |`);
    }
    text.push('','Une ligne sans partie conserve le profil de référence ; aucun candidat n’avait dépassé la référence pendant l’exploration.','');
  }else{
    text.push('| Durée | Contexte | Parties | Jade gagne | Nulles | Ambre gagne | Points Jade / parties |','|---:|---|---:|---:|---:|---:|---:|');
    for(const limit of [15,20,30,50,70])for(const label of ['Libre','Jade au nord','Jade au sud']){
      const s=summarize(games.filter(g=>g.limit===limit&&context(g)===label));
      text.push(`| ${limit} | ${label} | ${s.games} | ${s.firstWins} | ${s.draws} | ${s.secondWins} | ${pct(s.firstScoreRate)} |`);
    }
    text.push('');
    if(report.plan.protocol==='regions-context-study-v2'){
      text.push('| Budget | Parties | Jade gagne | Nulles | Ambre gagne | Points Jade / parties | Écart médian Jade − Ambre |','|---:|---:|---:|---:|---:|---:|---:|');
      for(const budget of report.plan.budgets){
        const s=summarize(games.filter(g=>g.budget===budget));
        text.push(`| ${budget} | ${s.games} | ${s.firstWins} | ${s.draws} | ${s.secondWins} | ${pct(s.firstScoreRate)} | ${s.rawMedianFirstLead??'—'} |`);
      }
      text.push('','Les deux camps utilisent ici le même budget et le même profil. La médiane exclut les issues imposées par une boucle ou le blocage des deux camps. Aucun réglage de compensation n’est adopté. Un changement rétrospectif du score ne mesure pas une stratégie jouant avec cette compensation.','');
    }else text.push('Les camps et profils sont inversés par paire. Les statistiques descriptives par camp ne remplacent pas l’Elo corrigé de l’avantage de Jade.','');
  }
  const publishedFile=path.join(directory,'published-catalog.json');
  if(fs.existsSync(publishedFile)){
    const catalog=JSON.parse(fs.readFileSync(publishedFile));
    if(catalog.ratings?.length){
      text.push('Elo interne : même calculateur Davidson que la branche classique, échelle propre à cette variante centrée conventionnellement sur 1500. Les intervalles appariés tiennent compte du regroupement des deux manches.','',
        '| Budget | Profil | Elo | IC 95 % du modèle | IC 95 % apparié | Parties |','|---:|---|---:|---|---|---:|');
      const interval=(a,b)=>a==null||b==null?'indisponible':`${a.toFixed(1)} à ${b.toFixed(1)}`;
      for(const r of catalog.ratings)text.push(`| ${r.budget} | ${catalog.profiles[r.budget].id} | ${r.elo.toFixed(1)} | ${interval(r.modelLower95,r.modelUpper95)} | ${interval(r.pairedLower95,r.pairedUpper95)} | ${r.games} |`);
      text.push('');
    }
  }
  for(const g of games){
    const body=fs.readFileSync(path.join(directory,g.file));
    if(crypto.createHash('sha256').update(body).digest('hex')!==g.sha256)throw Error(`Journal changed: ${g.file}`);
    const record=JSON.parse(body),budgets=record.agents.players,profiles=record.agents.profiles;
    rows.push([name,g.id,g.pair,g.seed,g.limit,context(g),budgets[0],profiles[0]?.id,budgets[1],profiles[1]?.id,
      g.result.winner===null?'nul':g.result.winner===0?'Jade':'Ambre',g.result.reason,g.result.scores?.[0]?.total,g.result.scores?.[1]?.total,record.actions.length,g.statistics?.seconds,g.sha256,path.resolve(directory,g.file)]);
  }
}
text.push('## Lecture des données','',
  'Le CSV contient une ligne par partie ; les journaux JSON restent dans leurs archives avec le moteur et les profils figés. Les durées mesurées incluent la concurrence normale de la machine et ne constituent pas un benchmark isolé. Les familles de graines de sélection, validation, ligue et équilibre sont distinctes. Les résultats historiques V9 ne sont pas mélangés à ces mesures.','',
  'La campagne neurale de l’autre branche n’est ni pilotée ni mise en pause par ces outils.','');
fs.writeFileSync(path.join(output,'RAPPORT.md'),text.join('\n'));
fs.writeFileSync(path.join(output,'parties.csv'),rows.map(row=>row.map(csv).join(',')).join('\n')+'\n');
console.log(path.resolve(output,'RAPPORT.md'));
