# Publication handoff — not executed

The current instruction is to stop before creating or publishing GitHub repositories.
Once publication is explicitly authorized, create the actual repository, push the
reviewed branches/tags, and check the installation guide from that public clone.
No GitHub remote is configured by the local tools. No large Release resource is
needed for this repository: its engines, fixtures and profiles (where applicable)
are tracked in Git.

Publish tracked source only, not a ZIP of a working directory containing build
caches, generated campaigns, private paths or local control logs. Read
[COMPLETENESS.md](COMPLETENESS.md) and [INSTALL.md](INSTALL.md) for scope and commands.
The existing website is a separate deployment and is not changed by this release.
