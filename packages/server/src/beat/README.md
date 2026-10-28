# Beats and sessions

`Session.start({ provider, store?, config?, clock?, dataDir? })` commits the
Episode N seed as beat 0. `Session.resume(id, options)` replays `Engine.fromLog`,
recovers a torn log tail and rebuilds the graph. Defaults are MemoryStore, real
time and `data/`. IDs are UTC ISO timestamps with colons/periods replaced by
hyphens, followed by eight UUID characters; tests can inject IDs and RNG seeds.
The graph holds one active session. Starting or resuming replaces its projection.

`submitIntent` validates the shared protocol shape and selection against the
player's knowledge slice: self, currently visible entities and own inventory.
Known facts alone do not make a hidden entity selectable. Errors identify the
invalid ID. Concurrent intents and ended sessions are rejected. `look()` supplies
the CLI's location, situation, visible entities and inventory.

BeatRunner uses an isolated engine snapshot, a fresh BeatContext, parallel peer
calls, the real registry/generators/NPC voices, and the existing critic retry and
fallback. Audible peer lines are provisional progress messages. Every successful
beat commits BeatStarted, intents and ordered tool drafts, optional RecapUpdated
and EpisodeEnded, then resolved NarrationCommitted; EventLog adds BeatCommitted.
Only events witnessed by the player enter beat_result, and only their checks and
attacks supply roll stamps. EpisodeEnded shares the winning beat's commit, even
when a peer obtains the quill away from the player.

The 120-second deadline covers preparation and projection. A cancelled attempt
cannot mutate the live engine or publish late progress. In-flight provider calls
may finish and record their usage; `drain()` waits for those trace writes. The
canonical write is allowed to settle once started: racing fsync against rollback
could discard an already durable beat. Projection runs after that write. Failure
returns the committed result and pauses before another beat; recovery serializes
behind outstanding projection writes and rebuilds from the canonical log.

Rotation is stored atomically in BeatCommitted's optional `rotation` payload;
older logs with an empty marker remain valid. Recaps are generated at the start of
beats 11, 21, etc. using only earlier committed events, excluding seed data and
previous recaps. The recap role defaults to Sonnet. RecapUpdated is committed with
that beat; an aborted attempt cannot change the session recap or rotation.

Clock supplies `now()` and cancellable `schedule()`. LLM/graph pauses retry after
5/10/20/40 seconds, then every 60 seconds, within a ten-minute horizon that survives
failed attempts. Health checks defer reruns without consuming an attempt: a small Sonnet ping for
LLM availability (traced and billed to the paused attempt), or a graph read. Tests
can inject `healthCheck`. Internal errors
and exhausted schedules wait for `retry_now` or `save_and_quit`. Budget pauses
require `raise_budget`, which adds and persists the configured step. The budget is
a soft cap checked between attempts, including the cost of aborted calls.

Each attempt writes `traces/beat-N-A.json`, with redacted full provider traces,
tool diagnostics, critic checks, context drops, feedback/total timings, cost and
committed/fallback/aborted outcome. The existing JSONL sink also retains call
records. `summary.json` at episode end or quit aggregates all attempts' costs,
tool error rate, critic rejections/fallbacks and detected leaks. Intent/recap and
rotation recovery use the log; budget settings use `settings.json`.

`npm run play:cli` uses the standard environment launcher and real providers;
`--neo4j` selects Neo4j, and `--resume ID` resumes a log. Mentions match visible IDs,
ID slugs or quoted full names, case-insensitively; ambiguous names require full
IDs. Mentions become selection IDs and are removed from intent text. Commands:
`/look`, `/inventory`, `/retry`, `/quit`, `/budget +5` (or the configured step).
The CLI contains presentation and input handling only. Both diagnostic samples
remain unchanged and keep their existing manual wiring.
