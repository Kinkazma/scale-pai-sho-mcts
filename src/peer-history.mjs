import {replay,makeRecordForState} from './replay-engine.mjs';

/** Recover a saved online game for export using its original engine only. */
export function recoverPeerRecord(saved){
  if(!saved?.settings||!Array.isArray(saved.actions)||saved.actions.length>10000)throw Error('Journal en ligne incompatible.');
  const {turnLimit,compensation,options}=saved.settings;
  const record={rules:saved.rules,turnLimit,compensation,options,actions:structuredClone(saved.actions)};
  const states=replay(record);
  return makeRecordForState(states[0],record.actions,{players:['human','human'],mode:'p2p'});
}
