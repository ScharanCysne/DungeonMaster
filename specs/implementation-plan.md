# Episode N — Implementation Plan

Source of truth: [`spec.md`](spec.md) (approved 2026-10-24). This plan only decides
**order, slicing and verification**. If the plan and the spec disagree, the spec wins
and the plan gets fixed.

## How the work runs

### Slices

The work is split into 21 slices (0–20) grouped into 4 milestones. Each slice:

- has one clear goal, a list of deliverables, and tests that must pass;
- is small enough to review in one sitting;
- ends with everything green: `npm run lint`, `npm run typecheck`, `npm test` (and
  `npm run test:integration` / `test:e2e` once those exist);
- is committed on the `episode-n` branch as one or more focused commits (imperative
  subject line, body explaining why).

### Delegation and verification

Implementation is delegated slice by slice to `/astra-worker`. For each slice:

1. **Brief.** The brief names the slice goal, the spec sections to read, the files to
   create or change, the tests that must exist and pass, and what's explicitly out of
   scope. Briefs point at the spec instead of retyping it.
2. **Build.** Astra implements and runs the test suite.
3. **Verify.** I independently re-run lint, typecheck and the tests, read the diff
   against the spec and the global engineering standards (no `any`, zod at every
   boundary, narrow error handling, no secrets in logs, tests through public
   interfaces), and run the thing where it can be run.
4. **Report.** You get a short summary per slice: what was built, test results, anything
   that deviates from the spec, and anything that needs your decision.
5. **Commit** once it's verified. A slice that fails verification goes back to Astra with
   specific findings; it is not committed half-done.

### Your checkpoints

You review at the end of each milestone, plus these decision points:

| When | Decision |
|---|---|
| Before slice 6 | Pick the CC0 asset pack(s) from a short list (screenshots of each) |
| End of M2 | Play a few beats through the text CLI to judge the DM before any UI exists |
| Slice 10 | Review the DM, peer, critic and generator prompts |
| End of M3 | First playthrough in the Codex UI |
| Slice 20 | Acceptance playthroughs |

---

## Milestone 1 — Headless world (slices 0–6)

Goal: the rules engine, the event log and the ontology graph work without any LLM or
UI, and the Episode N seed loads into them.

### Slice 0 — Clean slate and monorepo scaffold

- **Goal:** remove the C++ project and stand up the TypeScript monorepo.
- **Spec:** §1 Repository layout, Technology stack; §5 Developer commands.
- **Deliverables:**
  - Delete `src/`, `CMakeLists.txt`, the old `assets/` and the old `README.md`. The
    C++ fixes stay recoverable in `git stash` and in history.
  - Root `package.json` with npm workspaces (`packages/shared`, `packages/server`,
    `packages/client`), `tsconfig.base.json` (strict, ES modules), ESLint
    (typescript-eslint, `no-explicit-any: error`) + Prettier, Vitest workspace config.
  - `docker-compose.yml` with `neo4j:5-community` (named volume, ports 7474/7687,
    credentials from `.env`), `.env.example`, `.gitignore` (`node_modules`, `data/`,
    `.env`, build output).
  - `.nvmrc` with Node 24.
  - GitHub Actions workflow: install, lint, typecheck, unit tests on push and PR.
  - New `README.md`: what the project is, prerequisites, the commands from §5.
- **Tests:** one trivial test per package so the pipeline is proven end to end.
- **Done when:** `npm install && npm run lint && npm run typecheck && npm test` passes
  from a clean clone; `docker compose up -d neo4j` starts Neo4j and Browser loads.

### Slice 1 — Shared schemas

- **Goal:** every shape that crosses a boundary exists as a zod schema with derived types.
- **Spec:** §2 Node labels, Edges, Event log, Event catalogue; §3 Tool catalogue,
  `PeerTurn`, `CriticVerdict`; §1 Client ↔ server protocol; §2 seed outline.
- **Deliverables:** `packages/shared/src/{ids,ontology,events,tools,protocol,seed,config}.ts`.
  - Entity id helpers (`<label>:<slug>`, slugging with collision suffixes).
  - Config schema for limits, timeouts, model tiers and budget, with defaults from §3 and §5.
- **Tests:** valid and invalid samples for every schema, including realistic malformed
  LLM output (prose around JSON, missing fields, wrong enums, out-of-range numbers).
- **Done when:** the server and client packages can import every type, and the tests
  cover every schema.

### Slice 2 — Engine core

- **Goal:** the pure rules engine for exploration and social play.
- **Spec:** §1 Boundary rules; Rules summary; §2 Hard-state mirroring; §3 engine tools
  (all except combat), check receipts, per-beat limits; §2 Perception rule.
- **Deliverables:** `packages/server/src/engine/`:
  - `EngineState` and creating it from a validated seed.
  - A seedable RNG with seed `(sessionSeed, beat, attempt)`; dice expressions; checks
    with advantage and disadvantage; contested checks.
  - Commands: `move` (A* over a walkability grid taken from the map's collision layer,
    returning the tile path), `skill_check`, `contested_check`, `search`,
    `open_container`, `unlock_container`, `transfer_item` (including `buy` and `steal`),
    `equip`/`unequip`, `hide`, `apply_damage`, `heal`. Each returns
    `ToolResult` with events and plain-language facts.
  - Check receipts and the `questCritical` movement rule.
  - The perception rule computing `witnesses` for each event.
  - Snapshot and rollback for a beat; the end condition.
- **Tests:** happy path and every rejection path per command; dice distribution and
  advantage with a fixed seed; each perception case (same room, private, stealth win,
  unconscious, darkness); the end condition (player holds, peer holds, still hidden);
  rollback leaves state identical to the snapshot. Small fixture seeds and grids, not
  the real tavern.
- **Done when:** the engine has no I/O, no LLM imports and no `Date.now()`, and the
  tests pass.

### Slice 3 — Combat

- **Goal:** the 5e-lite combat mode.
- **Spec:** Rules summary (combat); §3 `attack`, `end_combat`.
- **Deliverables:** initiative order, turns and rounds, `attack` (to-hit against AC,
  weapon damage, unarmed fallback), 0 HP → unconscious, `end_combat` with reasons,
  `loot` transfers from unconscious holders.
- **Tests:** initiative ordering and ties, hit/miss/critical (natural 20) with a fixed
  seed, attacking out of turn is rejected, combat ends correctly, an unconscious
  character stops witnessing and acting.
- **Done when:** a scripted brawl in a test runs from `CombatStarted` to `CombatEnded`.

### Slice 4 — Event log, projector and in-memory graph

- **Goal:** the event log as the canonical history, projected into a graph.
- **Spec:** §2 Principles, Event log, Event catalogue, Knowledge model, Context queries.
- **Deliverables:**
  - `eventLog.ts`: an append-only JSONL writer with an atomic beat commit (one write +
    `fsync`, then the `BeatCommitted` marker); a reader that drops a beat with no marker.
  - The `OntologyStore` interface and `MemoryStore`.
  - `projector.ts`: event → graph mutation for every event type.
  - Context queries (knowledge slice, DM context, selection context) against the
    interface.
  - `graph:verify` (engine state vs graph).
  - Rebuilding engine state from a log.
- **Tests:** each event type's projection; replaying a log gives the same graph as live
  play and the same engine state; a beat with no marker is ignored; the knowledge slice
  contains only known facts, witnessed events and visible entities; verify catches
  injected drift.
- **Done when:** a scripted sequence of engine commands can be logged, replayed and
  verified with no drift.

### Slice 5 — Neo4j store

- **Goal:** the real graph backend behind the same interface.
- **Spec:** §2 Neo4j setup; §5 timeouts, Neo4j failure rows.
- **Deliverables:** `Neo4jStore` (neo4j-driver, parameterised Cypher, 5 s query / 10 s
  transaction timeouts); constraints and indexes applied on startup; a fail-fast startup
  check with a clear message; `npm run graph:rebuild -- <id>`; `npm run test:integration`.
- **Tests:** one contract test suite run against both `MemoryStore` and `Neo4jStore`
  (Neo4j from docker compose); constraint violations surface as typed errors.
- **Done when:** the contract suite is green on both stores, and a rebuilt graph is
  browsable in Neo4j Browser.

### Slice 6 — Episode N content

- **Goal:** the tavern, the cast and the quill as real content.
- **Spec:** Episode N scope; §2 Episode N seed outline; §4 Assets.
- **Before starting:** you pick the asset pack(s) from a short list with screenshots and
  licences (candidates: Kenney *Tiny Dungeon* / *Tiny Town*, and one or two other CC0
  16 px fantasy sets).
- **Deliverables:**
  - `content/assets/<pack>/` with its LICENSE file.
  - `content/episode-n/tavern.tmj` built in Tiled to the prototype's layout, with layers
    `floor`, `walls`, `furniture`, `collision` and an `entities` object layer.
  - `content/episode-n/sprites.json` (tag → frame, plus a fallback per kind).
  - `content/episode-n/seed.json`: the full cast (Kael, Ilsa, Doran, Mael, Brann, Tobb,
    Wren, the stranger), containers, about 15 items, about 20 facts, the episode quest
    and 3 personal quests, factions, and room `tileBounds` tied to the map.
  - The quill placed two discoveries deep, with clues spread across several NPCs so that
    talking, sneaking and fighting all lead somewhere.
  - A content loader that validates the seed against the map (every entity on a walkable
    tile and inside its room, every reference resolves).
- **Tests:** seed schema validation; the map/seed consistency check; the quill is
  reachable by at least one sequence of legal engine commands (a scripted
  "speedrun" test).
- **Done when:** `SeedLoaded` projects the full seed into Neo4j and it looks right in
  Browser.

**Milestone 1 review:** I show you the seeded graph in Neo4j Browser and the engine's
test coverage.

---

## Milestone 2 — Agents and the beat loop (slices 7–13)

Goal: a full beat runs end to end against the real models, playable through a
text-only CLI before any UI exists.

### Slice 7 — LLM provider

- **Goal:** the only place that talks to Anthropic.
- **Spec:** §3 LLM provider, Model tiers; §5 Cost tracking, timeouts.
- **Deliverables:**
  - The `LlmProvider` interface and `AnthropicProvider` (`@anthropic-ai/sdk`), with
    role → model mapping in config:
    - DM: `claude-opus-5-5`
    - story generator: `claude-sonnet-5-5`
    - peers, item/npc/feature generators, critic, recap: `claude-haiku-5-5`
  - Prompt caching on the stable system blocks.
  - Forced-tool structured output.
  - Timeouts (60 s DM / 20 s others) and 2 retries with backoff and jitter on
    429/5xx/network errors.
  - A tracing wrapper writing calls into the beat trace.
  - A cost calculator using a price table filled from Anthropic's current pricing
    (checked via the `claude-api` reference at implementation time).
  - `ScriptedProvider` for tests.
- **Tests:** retry and timeout behaviour with an injected fake transport and fake
  clock; cost maths including cache reads and writes; the API key never appears in
  traces or logs.
- **Done when:** a manual `npm run llm:ping` makes one real call per tier and prints
  latency and cost.

### Slice 8 — Tool registry

- **Goal:** engine commands and soft-state operations exposed as LLM tools.
- **Spec:** §3 Tool registry, Per-beat limits, Tool catalogue (engine, soft-state,
  terminal).
- **Deliverables:**
  - `ToolDefinition` and the registry.
  - zod → JSON Schema conversion for tool definitions.
  - Engine tools wrapping slice 2–3 commands.
  - Soft-state tools (`set_attitude`, `share_fact`, `create_fact`, `set_quest_status`).
  - The `narrate` terminal tool.
  - Limit enforcement in the handlers.
  - Parse failures returned as `is_error` results with messages that name the bad value.
- **Tests:** every tool's schema round-trips to JSON Schema; invalid input → `is_error`
  without side effects; limits enforced (attitude delta, `create_fact` kinds,
  `set_quest_status` refuses the episode quest).
- **Done when:** the whole catalogue is callable from a test harness with plain JSON input.

### Slice 9 — Generators

- **Goal:** item, NPC, feature and story generation through the validated pipeline.
- **Spec:** §3 Generator tools, Generator pipeline, Per-beat limits.
- **Deliverables:**
  - The shared pipeline (context → forced tool → zod → policy bounds → one retry →
    register → return).
  - Four generators.
  - Sprite resolution by tag.
  - Name de-duplication.
  - `EntityCreated` / `FactCreated` events.
- **Tests (scripted LLM):** valid output is registered in both the engine and the graph;
  invalid output → retry → `ok: false`; bounds enforced (rare / 500 gp, stat ranges, 12
  NPCs per episode, 3 generator calls per beat); a generated item placed in a container
  can be picked up with `transfer_item`.
- **Done when:** the scripted tests pass. A manual run against the real model generates
  5 items and 2 NPCs for review.

### Slice 10 — DM agent and prompts

- **Goal:** the DM tool loop.
- **Spec:** §3 DM agent (prompt structure, context budget); §1 Beat loop steps 3–4.
- **Deliverables:**
  - Versioned prompt files for the DM (role and principles, rules summary, tool usage
    guide with a worked example).
  - Context rendering from the DM context query, with the 12k-token budget and the
    dropping order.
  - The tool loop with the cap of 8 and the narrate-only fallback.
  - Prompt-cache-friendly ordering.
- **Tests (scripted LLM):** tool results are fed back in order; a cap hit → narrate-only
  call; missing `narrate` → retry; the budget trimming order; the rendered context for a
  sample state matches a reviewed snapshot.
- **Your checkpoint:** you review the DM prompt text.

### Slice 11 — Peers and critic

- **Goal:** peer agents with their own agendas, and the fidelity critic.
- **Spec:** §3 Peer agent, Critic; §2 leak check.
- **Deliverables:**
  - Peer prompt (versioned) built from the knowledge slice.
  - `PeerTurn` parsing (invalid → pass).
  - The rotation (max 2 per beat, priority rules, nudge after 3 passes).
  - Critic deterministic pre-check plus the LLM verdict.
  - The retry-once flow and the neutral-summary fallback built from events.
- **Tests:** rotation priority; invalid peer output → pass; each pre-check rule; the
  critic retry → fallback flow; **leak tests** for every peer and NPC in the seed.
- **Your checkpoint:** you review the peer and critic prompts together with the DM
  prompt from slice 10.

### Slice 12 — BeatRunner, sessions and the text CLI

- **Goal:** one beat, end to end, plus the episode lifecycle around it.
- **Spec:** §1 Beat loop (all steps); §5 Session pause, Cost tracking, failure
  catalogue; §3 rolling recap.
- **Deliverables:**
  - `BeatRunner` (intents → peers → DM loop → critic → commit → end check →
    broadcast payload).
  - Rollback on failure.
  - The session state machine with pause reasons, automatic retry (5/10/20/40/60 s,
    for at most 10 min) and re-running the beat.
  - The 120 s beat cap.
  - The budget cap and step.
  - The recap every 10 beats.
  - Beat traces on disk.
  - The session summary.
  - **`npm run play:cli`**: a text-only client that plays the episode in the terminal
    (selection by typing entity names or ids), for testing the loop before the UI
    exists.
- **Tests:** **golden beats** (seed + scripted LLM + intent → exact events, journal
  entries and end state); rollback leaves no events; pause → resume re-runs the beat
  once; budget pause; the episode ends when a peer picks up the quill.
- **Done when:** you can play from the start to the quill in the CLI against the real
  models.

### Slice 13 — Server and protocol

- **Goal:** the WebSocket server the client will use.
- **Spec:** §1 Client ↔ server protocol, Runtime topology; §4 DM view; §5 WebSocket
  failure row.
- **Deliverables:**
  - Fastify + `ws`, with zod validation of every message both ways.
  - `world_snapshot` and the player-perspective event filter.
  - The dev-mode ground-truth overlay, only when `DUNGEON_DEV=1`.
  - `debug_request` handlers (trace, knowledge slice, graph neighbourhood).
  - Heartbeat; reconnect with resend since the last seen beat.
  - Structured logging with pino.
- **Tests:** protocol round-trips through a real socket in tests; outside dev mode no
  hidden entity or fact ever appears in any message (checked over a full scripted
  session); reconnect resend.
- **Done when:** the CLI from slice 12 can optionally connect through the WebSocket
  server instead of in-process.

**Milestone 2 review:** you play a session in the CLI. We look at traces together and
decide on prompt changes before building the UI.

---

## Milestone 3 — The Codex UI (slices 14–18)

Goal: the full browser experience from §4.

### Slice 14 — Client foundation

- **Spec:** §4 Visual direction, Client store, React component tree; §1 protocol.
- **Deliverables:**
  - Vite + React + TypeScript, with Tailwind configured with the Codex colour tokens
    and fonts.
  - The Zustand store with the pure `applyServerMessage` reducer.
  - The WebSocket client with validation and reconnect.
  - `BookLayout` with the page structure from the prototype, using placeholder panels.
- **Tests:** reducer unit tests for every message type and the selection rules.

### Slice 15 — Map view

- **Spec:** §4 Map view, Pixel art.
- **Deliverables:**
  - `MapView` hosting Phaser: `TavernScene` loads `tavern.tmj` and sprites.
  - Largest whole-number scale that fits the frame.
  - Selection outlines and labels; changed-this-beat markers.
  - Movement tweens along engine paths.
  - The store ↔ scene bridge (`entity-clicked`, subscriptions).
- **Tests:** bridge logic unit-tested with a fake scene; visual check by screenshot.

### Slice 16 — Journal, composer, companions, satchel

- **Spec:** §4 Selection model, Composer, Journal, Companions and Satchel.
- **Deliverables:**
  - All journal entry types and the ink-in reveal with skip.
  - Scroll-follow with the "new entries" marker.
  - The composer (chips, limits, ↑ recall, disabled during a beat).
  - Party cards and the satchel with selection.
- **Tests:** React Testing Library for the composer and the journal reveal and skip;
  selection from every click source.

### Slice 17 — Appendix, DM view, Inspector

- **Spec:** §4 Appendix, DM view, Inspector mode.
- **Deliverables:**
  - The appendix bookmarks and drawer.
  - `GraphView` (Cytoscape.js) with change highlighting, the legend, a node popover and
    a Neo4j Browser link.
  - `TraceView`.
  - `KnowledgeView` with the agent picker and the DM-view extras.
  - The dev-only DM view overlay.
  - The Inspector layout behind `` ` `` (state preserved across the toggle).
- **Tests:** component tests for each view; the toggle keeps selection, scroll and
  composer text.

### Slice 18 — Pause, end of episode, replay

- **Spec:** §5 Session pause, Replay; §4 Episode end.
- **Deliverables:**
  - The pause overlay (reason, countdown, *Retry now* / *Save and quit*).
  - The budget prompt.
  - The end-of-chapter page.
  - Replay: server read-only sessions with snapshots every 10 beats,
    `npm run replay -- <id>`, and the beat timeline UI.
  - The log version check.
- **Tests:** replay at beat N matches the live state at beat N for a scripted session;
  an unknown log version is refused with a clear message.

**Milestone 3 review:** your first full playthrough in the Codex UI.

---

## Milestone 4 — Evals and acceptance (slices 19–20)

### Slice 19 — Scenario evals

- **Spec:** §5 Scenario evals, Cost tracking (eval budget).
- **Deliverables:**
  - `npm run eval [-- --scenario <name>]`.
  - The scenario YAML format and the 15 scenarios from §5.
  - Deterministic per-beat checks plus per-scenario checks.
  - `report.md` / `report.json` with metrics and a diff against the previous report.
  - The eval budget cap with partial reports.
- **Done when:** a full eval run completes. Its first report is the baseline for prompt
  tuning.

### Slice 20 — End-to-end tests and acceptance

- **Spec:** Acceptance criteria; §5 Test strategy (Playwright row).
- **Deliverables:**
  - A Playwright smoke test against the server in scripted mode (load, click an entity
    on the canvas, submit, see the journal entry and the map marker), added to CI.
  - Fixes for whatever the acceptance runs uncover.
- **Done when:** all six acceptance criteria in the spec hold. That includes two real
  playthroughs to the quill by different routes, played by you.

---

## Parallel lanes

The slices are listed in a safe sequential order. Once slice 1 lands, three lanes don't
depend on each other and could run at the same time if you want to go faster:

| Lane | Slices |
|---|---|
| World | 2 → 3 → 4 → 5 → 6 |
| LLM plumbing | 7 (needs only slice 1) |
| Client shell | 14 (needs only slice 1; uses fixture messages until slice 13 exists) |

Everything from slice 8 onward needs the world lane. The default is to run sequentially,
since one stream of changes is easier to review; parallel runs would use separate git
worktrees and be merged in slice order.

## Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| The DM ignores tools and narrates outcomes directly | Engine-enforced check receipts and the critic pre-check (slices 8, 11); the `cheat-success` and `conjure-quill` evals (slice 19) |
| Agents leak secrets | Knowledge slices built by one query and leak tests per agent (slices 4, 11); the server never sends hidden data outside dev mode (slice 13) |
| Beats are too slow or too expensive | Tiered models and caching (slice 7); a CLI checkpoint before the UI exists (end of M2); the `long-session` eval measures latency and cost (slice 19) |
| Neo4j adds friction in development | `MemoryStore` for all unit tests; Neo4j only in integration tests and dev runs (slices 4–5) |
| Asset pack doesn't fit the tavern layout | Packs picked with screenshots before slice 6; the sprite tag map separates content from frames |
| Prompt changes cause regressions | Versioned prompts, golden beats with the scripted LLM, and eval reports with diffs (slices 10–12, 19) |
