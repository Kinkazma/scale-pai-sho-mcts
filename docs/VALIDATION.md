# Validation scope

The exported current engine and numeric G1/G2/G3 profiles retain their source
values. Historical manifests are tested in-place. Deterministic action/value
checks exclude wall-clock timings. The private website and production campaign
are not used by the public entry points.

`npm test` includes rule tests, profile compatibility, retained-tree equivalence,
selection/confirmation, risk accounting, source freezing and replay checks.
Longer integration tests may take a few minutes. Use a separate output for any
experiment; never reset an existing validation ledger to obtain another attempt.

`publish-relational.mjs ARCHIVE` prepares a proposal and verifies complete evidence.
Its optional `--apply` changes the *local legacy catalogue*, not the frozen
G1/G2/G3 catalogue and not the public website. Online model installation remains
an explicit separate operation.
