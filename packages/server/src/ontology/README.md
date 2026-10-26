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

All queries use `OntologyStore.read` for one read scope (see isolation below). The
knowledge query keeps known facts, witnessed events and current visibility as three separate
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
field and engine/graph values.

## Neo4j store

`Neo4jStore.connect(loadNeo4jConfig())` verifies connectivity and installs the nine
unique ID constraints and `event_beat` index from the spec, all with `IF NOT EXISTS`.
Every node has `Entity` plus its ID-prefix label. Mutations select fixed,
parameterised Cypher from closed label/type mappings. Node and relationship
upserts replace properties while retaining creation provenance; relationship
identity also includes equipment slot or involvement role. Existing KNOWS
retraction survives replacement. `clear()` deletes the entire database graph;
`close()` releases the driver.

Scalar fields and string arrays (`tags`, `proficiencies`, item `properties`) are
native properties. `abilities`, `tileBounds`, `tile` and `roll` are JSON strings
under their original property keys. Missing optional fields have no property.
Integral scalars use Neo4j integers; fractional scalars use floats. Driver v6's
`disableLosslessIntegers` returns numbers. Reads validate through the shared Zod
node/edge schemas, extending the character schema to preserve its optional `tile`.
Invalid JSON or schema data fails the read.

Both stores order nodes by ID and edges by `edgeKey`, using plain code-unit
comparison in JavaScript. Queries inherit this order unless they explicitly sort,
such as recent events. Seed projection emits all nodes before relationships so
forward references, including room → building, exist when relationships are made.
Both stores reject absent endpoints with
`OntologyStoreError.kind === 'missing_endpoint'` and roll back the entire batch.
Mutations run in order: endpoint nodes must exist before their edges are upserted,
including within a batch. Neither store creates placeholder nodes or defers
mutations. Removing a node also removes its incident edges.

Each `apply()` uses one managed write transaction; `read(callback)` binds all
reader operations to one managed read transaction. Both use the shared
`timeoutsSchema` default `neo4jTransactionMs` (10,000 ms). Individual `getNode`, `nodes` and
`edges` calls use managed read transactions with `neo4jQueryMs` (5,000 ms).
`clear()` and schema transactions use the transaction timeout. Connection and
connection-acquisition timeouts default to the query timeout; the driver's retry
window defaults to the transaction timeout. Options can override these values.
Managed transactions may retry, so read callbacks must be idempotent. Timeouts
apply per transaction attempt, not to the total retry wall time. Sessions always
close. Neo4j uses its default read-committed isolation; concurrent writes can
become visible between reads within a transaction. MemoryStore alone guarantees
an immutable read snapshot during concurrent writes.

Driver errors are mapped in `neo4jErrors.ts`: `Neo4jUnavailableError`,
`Neo4jConstraintViolationError`, `Neo4jAuthError`, or `OntologyStoreError` with a
`kind` discriminator and original driver `cause`. Missing property-update targets
use `missing_node`; unknown application/validation errors propagate unchanged.
Startup messages identify the URI and startup command; authentication messages
also identify the user and suggest checking `.env`. Messages omit driver details
and credentials. Config validation reports variable names only, and config
inspection/JSON/stringification redacts credentials. Do not log authentication
tokens or raw driver errors.

## Rebuild and integration commands

From the repository root:

```sh
npm run graph:rebuild -- <sessionId>
npm run test:integration
```

Both load repo-root `.env` with Node's `--env-file`. Rebuild reads and validates
the entire `data/sessions/<sessionId>/events.jsonl` before connecting to Neo4j or
clearing the graph. A missing log exits non-zero with the session ID and expected
path, leaving the graph untouched; an existing empty log clears the graph.
Committed records are then applied in order, one transaction per record. The log
reader drops an uncommitted tail; `readEventLog` still treats missing files as
empty for other callers. The summary reports records, nodes, edges and dropped
records. A projection failure can leave a partially rebuilt graph; rerun from the
canonical log. `DUNGEON_DATA_DIR` overrides `data`; relative paths resolve from the
repo root. Rebuild targets the single Community database and replaces any
previously projected session. A missing session argument exits non-zero with
`Usage: npm run graph:rebuild -- <sessionId>`.

The root script delegates to the server workspace. Its small `.mjs` launcher uses
the already installed Vite `createServer`/`ssrLoadModule`, with middleware mode,
watching/HMR disabled and shared workspace source bundled into the module loader.
This supports TypeScript parameter properties and `.js` source specifiers without
adding a runtime dependency or emitting build files. The launcher closes Vite and
reports CLI errors on one line. `readRebuildLog(dataDir, sessionId)` requires and
validates the log; `rebuild(log, store)` contains the separate, unit-tested
projection logic.

`npm test` excludes `*.integration.test.ts`. The separate integration config runs
the same store contract plus live replay, encoding, schema, error and atomicity
checks. It requires Neo4j and fails on missing configuration or connectivity;
it does not silently skip unavailable infrastructure. It clears the configured
database before each test. Map loading remains a later slice.
