# Scale Pai Sho MCTS

Frozen **G1, G2 and G3** opponents and the evolutionary training system for
Scale Pai Sho. The default is **G3, MCTS 32**. These agents use deterministic
MCTS and evolved evaluation/search coefficients. There is **no human training
corpus and no neural network** in this Scale lineage.

**[Play on the public website](https://gaeldauchy.com/pai-sho/).** This repository
provides computation and training tools, not a second gameplay website or a
WordPress package. The sibling `scale-pai-sho` repository documents the game.
A compatible engine copy is included here so training needs no sibling checkout.

## Requirements and setup

Node.js 22.12+, Python 3.10+, and Git. The runtime uses only standard libraries;
no npm or Python package download is required. Python supervisors use Unix file
locking and signals. macOS was checked locally; Linux CI is configured but not
claimed passed until it runs. Windows supervision has not been qualified.

```sh
node cli.mjs doctor
npm test
node cli.mjs choose --generation 3 --budget 32
node cli.mjs match --generation 3 --opponent 2 --budget 32 --output match.json
```

For a retained tree and engine API, see `src/search-runtime.mjs` and
`scripts/evolution-relational-game.mjs`. Every real action must reach both seats'
search sessions, including reactions where the normal player does not change.

## Start a new evolutionary campaign from existing weights

```sh
node cli.mjs train --generation 3 --budgets 8,32 --workers 4 --seconds 1800 --output runs/new-g3
node cli.mjs status --output runs/new-g3
node cli.mjs pause --output runs/new-g3
node cli.mjs resume --output runs/new-g3
python3 scripts/dashboard.py --port 8771
```

Pause is cooperative and finishes dispatched pairs. Resume keeps the original
absolute deadline, source snapshot, profile state and validation evidence;
paused time is not added back. An expired campaign is not silently extended.
Default worker allocation uses detected CPUs, capped at 64. Use `--workers` to
choose a smaller allocation. There is no automatic campaign on installation.

The public launcher creates a **new** campaign from the selected generation:
two parents (the frozen model and a seeded first mutation), seven descendants,
independent budget lanes, six paired selection starts and the existing bounded
sequential confirmation policy. G1/G2/G3 references available at each budget form
a fixed equally sampled pool. Selection and independent confirmation remain
separate. Passing the mixture criterion does not prove superiority to every
individual reference. Completed winners are not automatically installed online.

## Generations

| Generation | Available budgets |
|---|---|
| G1 | 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 |
| G2 | 8, 16, 32, 64 |
| G3 | 8, 32 |

`profiles/gen*.json` contains frozen retained profiles; `src/ai-generations.json`
is the complete played catalogue, including the remaining G1 budgets. Public
generation labels are distinct from an internal mutation ID such as `g1-b8-c2`.
All offered generations run under the current V14 rules. They are historical
weights, not historical rules. `gen1`, `gen2`, `gen3` branches select their default
generation; they share the corrected engine and campaign tooling.

## Architecture and data

- `src/engine.mjs`, `region-resolution.mjs`: rules, scores and terminal outcomes.
- `search*.mjs`: UCT, widening, retained trees, value caches and tactical solving.
- `triangle-relations.mjs`, `relational-value.mjs`: available/latent triangular
  relations, reconfiguration, pressure, mobility, influence and reserve flexibility.
- `tactical-continuation.mjs`, `repetition-guard.mjs`: bounded tactical sequences
  and action repetition safeguards.
- `scripts/evolution-relational-*`: seeded mutation, match workers and selection.
- `scripts/sequential-*`, `reference-pool.mjs`: independent evidence, cost limits,
  persistent candidate dossiers and rotation.
- `scripts/run-independent-campaign.py`: separate budget progress and worker pools.
- `history/`, `fixtures/`, `tests/`: exact historical replay and search regressions.

New runs archive seeds, paired games, profiles, frozen source hashes and validation
ledgers under the chosen output. The old private campaign is not restarted by
these commands. A brief test shows that the pipeline executes; it is not evidence
that a new descendant is stronger. No Elo or guaranteed endless progress is claimed.

Original code and weights are [MIT licensed](LICENSE). Historical rule documents
may retain their original language to preserve archived checksum tests. Current
entry points, documentation and management interface are English.

See [installation and continuation](docs/INSTALL.md), [completeness](docs/COMPLETENESS.md),
and [local validation and remaining work](docs/LOCAL_VALIDATION.md).
