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
