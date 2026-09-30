# What can be reproduced from this repository

| Item | Supplied | Limit |
| --- | --- | --- |
| Rules and engine | Current V14 + historical readers/fixtures | All offered G1/G2/G3 weights play under current rules |
| Frozen profiles | `profiles/gen1.json`, `gen2.json`, `gen3.json`, full catalogue in `src/ai-generations.json` | G2 and G3 cover fewer budgets than G1 |
| MCTS | UCT, widening, reuse, value caches, relations, tactical continuation, repetition safeguards | No claim of unlimited or monotonic improvement |
| Evolution | Two-parent/seven-descendant launcher, independent budget supervisors, paired selection and confirmation | New campaigns from profiles, plus optional continuation of the final closed campaign |
| Saved evidence | 1,792 final G3 records and associated verified evidence | Final evidence in Git; closed-campaign and spent-validation journals in the optional history pack |
| Continuation | New campaigns retain frozen runtime, games, parents, ledgers and absolute deadline | The optional historical importer relocates the captured partial-selection boundary with a new explicit duration; arbitrary active-run relocation is not claimed |
| Controller | English loopback start/status/pause/resume | Not every chart/function of the old dashboard |

Everything required to play or start a new campaign is in Git. An optional
121 MB historical-state pack supports the separate restoration workflow. There
are no human training games or neural weight files for this Scale lineage.
Numeric G1/G2/G3 profiles retain their archived values. The `gen1`, `gen2`, `gen3`
branches choose launcher defaults while sharing compatible tools. A local internal
candidate ID is not a public generation number.

Website packaging, artwork and private hosting infrastructure are not included.
Use the maintained demo link in README. New experimental outputs never replace
the frozen profiles. Independent confirmations and cost criteria remain necessary
before adopting a new model. See [installation](INSTALL.md) for runnable commands.
