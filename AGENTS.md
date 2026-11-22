# AGENTS.md

What an agent working in this repository needs to know. The README says
what the plugin is and how to run its tests.

## Coding standard

`.tehas/coding-standard` says which coding standard this repository
follows: `v1` for now, the code as it is. Coding standard v2 is the tehas
system's architecture method, ten rules about where knowledge lives,
not the code style: one owner for each piece of knowledge, outside systems
behind ports in our own terms, a pure core with effects at the edge, typed
seams, deep modules, failures handled in the adapter, tests at the
interface, dependencies pointing inward, contracts changed by expand then
contract, and small steps that keep behaviour. Each repository adopts it
in its own time; this one has not yet, and nothing here enforces it.

When this repository adopts it, `scripts/architecture.py` and
`scripts/architecture_test.py` come in unchanged from the other tehas
repositories. The script is the same file in all of them and changes in
all of them together, never in one copy.
