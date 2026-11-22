# Server and protocol

`npm run server` starts Fastify on `HOST` (default `127.0.0.1`) and `PORT`
(default `8787`). The standard `loadProjectEnv` launcher configures the provider;
`--neo4j` selects Neo4j instead of MemoryStore. `DUNGEON_DATA_DIR` defaults to
`data/`. The launcher reads `DUNGEON_DEV === '1'` once at startup.

`createServer({ provider, store?, content?, config?, clock?, sessionFactory?,
dev?, logStream? })` returns a Fastify instance. `GET /healthz` returns
`{"status":"ok"}`. `/ws` accepts JSON text messages validated by the shared
client schema; malformed messages return `BAD_MESSAGE` without closing the
connection. All sends validate the shared server schema. `sessionHost.flush()`
also throws delivery/validation failures even when a Session observer catches
them; `idle()` additionally waits for outstanding client operations.

The first successful `hello {episodeId: "episode-n"}` starts one Session. Further
hellos attach to it. The first attached socket is the driver; all others observe
broadcasts but receive `NOT_DRIVER` for intents **and session commands**. When
the driver disconnects, the oldest attached observer becomes driver. A reconnect
does not displace an existing driver. Repeated hello does not change priority.
Disconnects leave the Session running; shutdown saves it and drains provider work.

Session remains responsible for intent validation, beats, retries, budget pauses,
commands and ending. Peer lines/status come from Session; a visible selection can
also receive a provisional player look-at cue. No provisional movement, rolls or
narration are sent. Heartbeat pings every 15 seconds; a missing pong terminates
the socket at the next tick. Heartbeat and Session share the injectable Clock.

`perspective.ts` is the pure player-data boundary. Snapshots contain self,
currently visible entities and carried items, their directly located positions,
known party IDs, inventory IDs, player gold, map ID and up to 20 narrations.
Carried items have no separate map position. Other characters' summaries use their
appearance; background/personality are blank. Discovery/lock DCs and key mappings
are withheld. Facts absent from KNOWS, hidden references and private peer intents
are excluded, including from progress, nested event payloads and narration.
Rolls are rebuilt only from surviving witnessed events. Known fact truth is
`unknown`. The existing ontology-shaped wire nodes retain their required fields.

`PlayerHistory` projects committed records into a separate MemoryStore so an
external graph outage cannot hide a durable result. Each result is filtered at its
original beat and cached. A reconnect receives a current snapshot, then exactly
the cached results whose beat is greater than `hello.lastSeenBeat`; later knowledge
never expands an old result. Per-connection beat tracking avoids lost/duplicate
results when a commit races a snapshot. An injected `Session.resume` factory can
reconstruct the same history after restart; the default launcher starts a fresh
session after restart. Resend is scoped to that session. Future lastSeenBeat values
are rejected. Current pause/end state is included when attaching.

Only `dev: true` enables `beat_result.groundTruth` and debug requests. The snapshot
schema has no overlay field. Otherwise `groundTruth` is absent and every debug
request returns `DEBUG_DISABLED`, even before hello. Dev targets:

- `trace`: omitted means the latest committed beat; `3`, `3:1` or `beat-3-1`
  selects a beat/latest attempt or explicit attempt from Session's trace files.
- `knowledge`: character ID, default player; uses the injected ontology store.
- `graph`: comma-separated IDs, default player; unions depth-one neighbourhoods.

Fastify's pino logger records beat/attempt outcomes, latency and cost, plus
warnings/errors. Request serializers omit headers, URLs, bodies and error details;
authorization is also explicitly redacted. The launcher writes JSON lines to
stdout and the session's `server.log`. Full prompts remain in the existing trace
sink, never the server log.

Tests use real Episode N content, ScriptedProvider, MemoryStore and fake time.
Socket suites use Node 24's native WebSocket on ephemeral loopback ports; only the
silent-heartbeat case uses a raw HTTP upgrade because native clients always pong.
If the execution sandbox denies binding with EPERM, those tests explicitly skip;
direct SessionHost, history, visibility and heartbeat tests still run. No network
provider calls are made. The optional CLI WebSocket mode is deferred; `play:cli`
continues to use Session in process.

## Pause, chapter end and replay

Pause messages include the configured budget increment, and only in developer
mode the underlying error code and attempt trace ID. Reconnecting recomputes the
remaining countdown. The existing 5/10/20/40/60-second schedule stops within ten
minutes. Saving acknowledges with `session_saved`; committed logs remain available.
Chapter summaries use the existing recap, falling back to the winning narration
for short runs. The same perspective boundary filters summaries during live play,
reconnection and replay.

`npm run replay -- <sessionId>` uses `scripts/replay.mjs` and `loadProjectEnv`,
serving the same port and client WebSocket endpoint as `npm run server`. No API key
or provider calls are needed. `--neo4j` follows the live server's store option:
the validated committed log rebuilds the configured graph at startup. Missing logs
name their expected path; unknown major versions name found and supported versions.
Replay never repairs or writes the source event log, including an incomplete tail.

`createServer({ replayId, provider, ... })` opens replay before serving. The provider
is unused; tests inject one that throws on every call. `ReplayArchive` checkpoints
both engine and player history (MemoryStore, remembered visibility and filtered
results) every ten beats, including beat zero. A seek clones the nearest checkpoint
and applies at most nine beats. Each viewer has its own MemoryStore cursor, so
simultaneous seeks and graph/knowledge requests cannot change another viewer's
perspective. A configured Neo4j graph retains the full session projection; cursor
debug queries use the corresponding in-memory projection. Traces beyond the cursor
are refused. Engine replay retains the existing `fromLog` semantics: persisted hard
state is rebuilt; transient dice receipts are unnecessary in a read-only session.

Hello sends `replay_info`, then one atomic `replay_state` containing the chosen
snapshot, filtered historical results and optional ending. Developer mode adds
ground truth, including at the seed. `replay_seek` changes that cursor; intents and
all session commands return `READ_ONLY`. See the shared schema notes for details.

The live end-page driver can send developer-only `replay_session` to switch all
attached viewers to beat zero of that log, or `start_new_run` to start a new Session
from content seed with a fresh ID. This explicitly uses `Session.start`, even when
the initial session factory resumed a saved run. Reset plus seed snapshot broadcasts
clear old client state. `onSessionStarted` lets the launcher rotate per-session
logging for both initial and new runs. Replay has no new-run control because all
session commands are refused there; restart the live server to leave replay mode.

Deterministic suites cover checkpoint bounds, live/replayed hard state and player
perspective, independent cursors, developer gating, read-only commands, immutable
source logs, version/path errors, launcher errors and seed resets.
