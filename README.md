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
npm run build -w @dungeon/client
```

The npm workspaces are `packages/shared` (protocol and future schemas),
`packages/server` (server foundation), and `packages/client` (Vite and React).
Shared exports point directly at TypeScript source, so no shared build is required.

See [specs/](specs/) for the source of truth and
[the implementation plan](specs/implementation-plan.md) for slice boundaries. The
full developer command list is in [the spec](specs/spec.md#developer-commands);
combined server/client development, integration tests, end-to-end tests, evals,
replay, and graph tools arrive in later slices.
