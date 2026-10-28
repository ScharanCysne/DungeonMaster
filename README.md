# Dungeon — Episode N

Dungeon is an AI-driven, single-player D&D game in pixel art for the browser, with
LLM agents playing the dungeon master and party. Episode N is the first mechanics
testbed; see [the design spec](specs/spec.md) for the game and architecture.

Prerequisites: Node 24 (with npm) and Docker with Docker Compose.

Quick start from the repository root:

```sh
npm install
cp .env.example .env
```

Set `NEO4J_USER` to `neo4j` and choose a local `NEO4J_PASSWORD` of at least eight
characters in `.env`, then run:

```sh
docker compose up -d neo4j
npm test
npm run dev -w @dungeon/client
```

Open the URL printed by Vite for the client. Neo4j Browser is at
<http://localhost:7474>. This scaffold renders the episode heading and shared
protocol version; unit tests and the client do not require Neo4j or an API key.

Development checks:

```sh
npm run lint
npm run format
npm run typecheck
npm test
npm run test:integration
npm run graph:rebuild -- <sessionId>
npm run content:check
npm run graph:seed
npm run build -w @dungeon/client
```

`test:integration` loads `.env` and runs the store contract against Neo4j; it
clears the configured graph before each test. `graph:rebuild` loads `.env`, reads
and validates `data/sessions/<sessionId>/events.jsonl`, then connects, clears the
graph, and projects the committed records. A missing log exits non-zero, naming
the session and expected path, without changing the graph. An existing empty log
clears the graph. Set
`DUNGEON_DATA_DIR` to override the data directory (relative paths resolve from the
repo root). Both commands require Neo4j; `npm test` does not. See the
[ontology README](packages/server/src/ontology/README.md) for encoding, transaction
semantics and rebuild details.

`content:check` validates the Episode N seed, map, sprite mappings and placements
without Neo4j. `graph:seed` validates the same content, then loads `.env`, clears
the configured Neo4j graph and projects the episode's `SeedLoaded` event, printing
node and edge counts. See the [episode guide](content/episode-n/README.md) for
solution paths, map conventions and editing instructions.

`npm run agents:sample` runs two Episode N beats with real peers, DM, NPC voices,
generators and critic, using an in-memory engine and graph. It uses the standard
project environment launcher and requires an API key and network access. It prints
turns, tool calls, dialogue, verdicts, retry/fallback flags and per-role cost/latency.
See the [peer](packages/server/src/agents/peers/README.md),
[voice](packages/server/src/agents/npc-voice/README.md) and
[critic](packages/server/src/agents/critic/README.md) rules.

The npm workspaces are `packages/shared` (protocol and future schemas),
`packages/server` (server foundation), and `packages/client` (Vite and React).
Shared exports point directly at TypeScript source, so no shared build is required.

See [specs/](specs/) for the source of truth and
[the implementation plan](specs/implementation-plan.md) for slice boundaries. The
full developer command list is in [the spec](specs/spec.md#developer-commands);
combined server/client development, end-to-end tests, evals, engine replay and
graph verification arrive in later slices.
