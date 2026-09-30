# Install, play and continue evolutionary training

Use Node.js 22.12+, Python 3.10+ and Git. The engine and command-line tools use
standard libraries: no npm/pip download, external weight archive, human corpus,
GPU package or account is required. The Python campaign supervisor uses Unix
signals and file locking. macOS is checked locally; Linux CI is supplied; Windows
supervision has not been qualified.

From the repository root:

```sh
node cli.mjs doctor
npm test
node cli.mjs choose --generation 3 --budget 32
node cli.mjs match --generation 3 --opponent 2 --budget 32 --output match.json
```

The last command saves a legal game record and refuses to overwrite an existing
file. Use a different output for each game. Interactive board play remains on
the existing website linked in README; no new website is installed here.

## Start from supplied profiles

```sh
node cli.mjs train --generation 3 --budgets 8,32 --workers 4 --seconds 1800 --output runs/first
```

This is an explicit new evolutionary campaign, never part of installation. G1,
G2 and G3 profiles are in Git. The selected generation becomes the starting parent;
the other initial parent is a seeded mutation. Two parents and seven descendants,
independent budget lanes, paired selection and separate confirmation are retained.
Weights are evaluation/search coefficients, not neural networks.

Available budgets differ: G3 has 8/32; G2 has 8/16/32/64; G1 has those plus
128/256/512/1024/2048/4096/8192. Generation and MCTS budget are separate arguments.

## Pause and resume a new campaign

From a second terminal:

```sh
node cli.mjs status --output runs/first
node cli.mjs pause --output runs/first
```

Wait until the supervisor exits and the status says paused before resuming:

```sh
node cli.mjs resume --output runs/first
```

Resume uses the campaign's frozen runtime, profiles, saved games, source hashes
and validation ledgers. Keep its entire output directory, sibling configuration,
family registry and validation directory together. Use the original path for this
resume: moving an active campaign's generated absolute paths is not qualified.
Paused time does not extend its absolute deadline. An expired campaign cannot be
resumed by that command; start a separate new campaign deliberately instead.
Never delete a validation ledger to get a fresh statistical attempt.

The English local controller is optional and starts explicitly:

```sh
python3 scripts/dashboard.py --port 8771
```

The controller launches and observes jobs; it is not the complete old analysis
site. An eligible training candidate is not automatically deployed to the website.
See [completeness](COMPLETENESS.md) and [validation](LOCAL_VALIDATION.md).

## Restore the final historical campaign

The optional [historical continuation guide](HISTORICAL_CONTINUATION.md) restores
the captured closed campaign into a new directory. It preserves partial games,
parents, seeds and validation spending; it requires an explicit new duration.
This differs from the ordinary new-campaign command above.
