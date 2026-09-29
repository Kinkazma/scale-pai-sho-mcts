# What can be reproduced from this repository

| Item | Supplied | Limit |
| --- | --- | --- |
| Rules and engine | Current V14 + historical readers/fixtures | All offered G1/G2/G3 weights play under current rules |
| Frozen profiles | `profiles/gen1.json`, `gen2.json`, `gen3.json`, full catalogue in `src/ai-generations.json` | G2 and G3 cover fewer budgets than G1 |
| MCTS | UCT, widening, reuse, value caches, relations, tactical continuation, repetition safeguards | No claim of unlimited or monotonic improvement |
| Evolution | Two-parent/seven-descendant launcher, independent budget supervisors, paired selection and confirmation | New campaign from supplied profiles; every old private exploratory campaign is not exported |
| Saved evidence | 1,792 final G3 records and associated verified evidence | Final evidence, not all intermediate experiments |
| Continuation | New campaigns retain frozen runtime, games, parents, ledgers and absolute deadline | Expired deadlines are refused; relocation of active campaign paths is not qualified |
| Controller | English loopback start/status/pause/resume | Not every chart/function of the old dashboard |

Everything required for these commands is in Git; there are no large release
packs, human training games or neural weight files for this Scale lineage.
Numeric G1/G2/G3 profiles retain their archived values. The `gen1`, `gen2`, `gen3`
branches choose launcher defaults while sharing compatible tools. A local internal
candidate ID is not a public generation number.

Website packaging, artwork and private hosting infrastructure are not included.
Use the maintained demo link in README. New experimental outputs never replace
the frozen profiles. Independent confirmations and cost criteria remain necessary
before adopting a new model. See [installation](INSTALL.md) for runnable commands.
