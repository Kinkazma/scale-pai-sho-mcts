# Local extraction checks — 29 September 2026

- All 157 Node tests passed after restoring historical checksum documents and
  required replay modules. The earlier missing-file failures are resolved.
- A G3/G2 MCTS-8 game completed by the four-identical-captures rule and was saved.
- Both MCTS-8 and MCTS-32 independent lanes ran under a 45-second deadline and
  drained their scheduled pairs without an error.
- A deliberately small pipeline check completed 12 selection and 2 confirmation
  games, including a saved checkpoint and verified current profiles. This checks
  the pipeline; it does not establish a new stronger generation.
- All 1,792 final G3 selection/confirmation records were rehashed and replayed
  through the exported V14 engine; every final outcome matched its saved record.
- G1/G2/G3 numerical profiles are the archived profiles. Human training data is
  not part of this lineage.

`data/final-g3-confirmation` contains the final comparison evidence. Earlier
exploratory campaign state and statistical ledgers are not all packaged here.
The wrapper starts a new independent campaign from frozen weights; it must not
be described as an exact continuation of those old campaigns.

The English controller starts, observes and requests cooperative stop. Its
shared Skud variant was exercised in a browser. Native resume/independent-lane
behavior is covered by the Node integration suite. Linux CI is configured but
has not run on a remote service; Windows process supervision is unqualified.

Historical document links were made relative and their document checksums
updated; archived engine bytes and rule behavior were preserved.
