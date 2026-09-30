# Continue the closed Scale evolutionary campaign

The ordinary launcher starts a new campaign from G1/G2/G3 and needs only Git.
The optional `scale-history-01.tar.gz` additionally supplies the historical
campaign state at closure: parents, earlier parent history, exact frozen runtime,
partial selection games, accumulated independent validation evidence and its
already-spent statistical allocations. It is not required to play.

```sh
python3 scripts/history-assets.py install --from-dir /path/to/downloads
python3 scripts/continue-history.py prepare --archive assets/history --output runs/history-study --seconds 1800
python3 scripts/continue-history.py run --output runs/history-study
```

Preparation verifies the exported file hashes, copies the state into a separate
directory, resolves neutral paths and checks the frozen sources, exact next
selection jobs, partial game receipts and all accumulated validation dossiers.
It starts no training. A separate `verify --output runs/history-study` command
can repeat the initial verification before starting.

The two lanes continue independently: budget 8 at round 105 and budget 32 at
round 37. The captured boundary is partial selection, before a new independent
validation transaction. Existing pairs, candidate identities, next validation
indices, seeds, costs and risk allocations are retained. The generation's
selection jobs are regenerated and compared with their saved plan.

The old campaign was deliberately **closed**, with 46,302.25 seconds unused.
That is not permission to run again. `run` establishes a new deadline from the
explicit duration; it cannot grant that duration a second time. Only run-control
metadata changes: paths, process IDs and deadlines. The old closure remains as
`HISTORICAL_CLOSURE.json`. The frozen engine and mutation protocol are unchanged.
Dispatched pairs finish cooperatively and may outlast the deadline slightly.

The copied ledger includes historical source transaction hashes as provenance.
These hashes must not be confused with checksums of anonymized/rebased JSON;
validation games, paired outcomes, costs and candidate identities are verified
independently. Completed historical rounds are supplied for study; the public
continuation entry point resumes the captured partial-selection boundary.

Keep the restored run in the same location after preparation. Interrupted new
processes should be inspected before further recovery; do not rerun `prepare`
or erase ledgers to renew statistical evidence. Final G3 confirmation records
are also in the ordinary Git checkout. A successful continuation is not proof
of a stronger next generation or guaranteed monotonic improvement.

## Local verification — 30 September 2026

The exported state restored 87 frozen source copies, 52 validation dossiers,
1,976 complete independent pairs and 84 partial selection games. Every validation
game was replayed; saved outcomes, costs and identities matched. A separate
continuation preserved all 84 old game bytes and added 10 games per budget,
then exited without error. Its eight-second dispatch window finished after
already-engaged pairs, with 132 seconds of cooperative drain on the busy test
machine. This is a restoration check, not a throughput or strength benchmark.
The archive was also installed and verified in a clean directory.
