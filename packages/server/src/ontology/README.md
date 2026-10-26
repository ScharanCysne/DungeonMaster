# Event log and ontology

`envelopeDrafts(drafts, envelope)` validates v1 records with sequences starting at
zero. `EventLog(dataDir, sessionId).commitBeat(envelope, drafts)` appends all records
and its `BeatCommitted` marker in **one write**, then fsyncs and closes the file.
This follows the Slice 4 request's single-write marker placement. Commits on one
instance are serialized; use one writer instance per session. Beats must increase,
sequences must be contiguous, and session directory names allow ASCII letters,
digits, underscores, dots and hyphens, starting with a letter or digit.

`readEventLog` returns `{records, droppedRecords}`. It validates all complete lines,
rejects unsupported versions and interior corruption with line numbers, and drops
a final uncommitted beat, including a torn final JSON fragment. Missing files are
empty logs. Appending after an incomplete tail is refused; file repair is outside
this append-only API. Project only after commit succeeds, and replay committed
records in order into an empty store to rebuild. A failed projection can be retried
as a whole batch. There is no cross-process writer lock.

## Projection

`project(record)` is pure and covers the entire catalogue. `GraphMutation` is the
declarative store boundary; `MemoryStore.apply` applies a batch atomically. Nodes
upsert by ID; edges by type/endpoints, additionally slot for `EQUIPPED` and role for
`INVOLVES`. Existing creation provenance survives property updates. Replacement
ownership/location edges carry the replacing record's provenance. Seed nodes and
relationships always use `seed` / beat 0, including all seed knowledge, secrets,
attitudes, memberships, quests and placements. Relations absent from the seed
schema, such as `WANTS` and `ORIGIN_OF`, can arrive through `EntityCreated.edges`.

Only IntentReceived, CheckRolled, AttackResolved, CombatStarted, CombatEnded,
NarrationCommitted and EpisodeEnded create Event nodes, as listed in the catalogue.
IDs are `event:<beat>-<seq>`; summaries normalize whitespace. Rolls retain the
actual recorded roll (the actor's roll for a contest; both remain in the log).
WITNESSED uses the stored witnesses exactly, including private events; INVOLVES
uses explicit payload references and the actor. No location is inferred for events
whose payload lacks one. Hard-state events update properties/relationships without
extra Event nodes. Healed removes a consumed item's node and incident edges.

ContainerOpened and EntityRevealed additionally create one true observation Fact,
`fact:observation-<beat>-<seq>`, ABOUT the affected entity and any revealed contents.
Its statement describes the recorded observation; each stored witness gets KNOWS
with source `witnessed`, confidence 1, and the event beat. ContainerUnlocked restores
revealed contents but does not synthesize an observation under this explicit scope.

FactCreated accepts optional `supersedes`, creating new-Fact → old-Fact SUPERSEDES.
FactLearned emits KNOWS followed by `retractSupersededKnows`. The store resolves
**direct** SUPERSEDES targets against only that learner's existing KNOWS edges in
the same mutation batch, setting the earliest `retractedAtBeat` without deleting
beliefs or changing creation provenance. Other learners are untouched. Re-learning
an already retracted fact preserves its retraction. BeatStarted, BeatCommitted,
CriticRejected, TurnAdvanced and RecapUpdated produce no mutations.

GraphNode extends the shared node shape with character `tile` metadata for hard
state mirroring. Debug graph and knowledge results strip that character-only
extension to satisfy the existing shared schemas. Item positions remain holders;
container tiles are already part of the shared schema.

## Queries and verification

All queries use `OntologyStore.read` for one consistent read snapshot. The knowledge
query keeps known facts, witnessed events and current visibility as three separate
reads with distinct result shapes; no UNION. It includes retracted KNOWS unchanged
so prompts can render “used to believe”, plus the sheet, outgoing attitudes,
pursued quests, inventory and secrets that are also known. HAS_SECRET never bypasses
KNOWS. Events are filtered by inclusive `sinceBeat`, then ordered by beat/sequence
descending and limited (`recent` defaults to 20).

Visibility follows the spec's LOCATED_IN query: non-hidden physical entities directly
placed in the same room. Spots resolve through PART_OF, with the engine's geometric
fallback for orphan spots. Other characters' carried items and container contents
are not expanded by this visibility query; own inventory is separate. Witnesses
remain authoritative for past events; queries do not recompute darkness or stealth.

DM context is ground truth, including hidden entities and recursively held items,
with location/ownership edges, all quests, recent Event nodes and selection context.
For Episode N, **adjacent means every other room in the same building**. Without a
building ancestor, only the player's room is included. Selection returns each
existing distinct selected node and both directions of exactly one hop, including
known facts and incoming ORIGIN_OF backstories. It is the DM/debug view and requires
separate knowledge filtering before any player-facing display.

`verify(engineState, store)` reports missing/extra physical entities and hard-state
drift, including tiles, location, holders, inventory, contents, equipment, HP,
consciousness, visibility, gold and container flags. Messages name the entity,
field and engine/graph values. Neo4j, map loading and the CLI are later slices.
