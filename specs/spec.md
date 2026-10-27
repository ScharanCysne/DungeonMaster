# Dungeon — Episode N Design Spec

Status: approved (2026-10-24). Amended 2026-10-26 after the [literature review](literature-review.md).

## Contents

- [Vision](#vision)
- [Episode N scope](#episode-n-scope)
- [Decisions](#decisions)
- [Glossary](#glossary)
- [Section 1 — Architecture](#section-1--architecture)
- [Section 2 — Data model](#section-2--data-model)
- [Section 3 — Agents and tools](#section-3--agents-and-tools)
- [Section 4 — Client and UI](#section-4--client-and-ui)
- [Section 5 — Errors, testing and observability](#section-5--errors-testing-and-observability)
- [Acceptance criteria for Episode N](#acceptance-criteria-for-episode-n)
- [Next steps](#next-steps)

---

## Vision

A single-player D&D game in the browser, in pixel art. The Dungeon Master and every
other party member are LLM agents. World data (characters, items, places, quests,
lore, who knows what) lives in an ontology graph that is updated as play unfolds.
Content is created on demand by LLM generators (story, items, characters), so the
world feels open and organic rather than scripted.

The full game will have a top-down overworld for travel and interior views for
dungeons, taverns and other places. Episode N builds none of the overworld. It builds
the core loop that everything else will sit on.

## Episode N scope

Episode N is the first sub-project and a mechanics testbed, not a full game.

### Premise

- The game starts mid-campaign, as "episode N" of a longer story. The player character
  already has a background, 2–3 AI peers with their own histories, and some items.
- The party is inside a single tavern (common room, bar, kitchen, upstairs rooms,
  cellar). The player can attempt anything a D&D player could: talk, lie, bribe,
  search, steal, fight, gamble, cast a (narrative) spell.
- A magic quill is hidden somewhere in the tavern. Its true location is in the seed and
  is known only to the DM. NPCs may know rumours or fragments that point towards it.

### End condition

The episode ends when the quill enters the party's possession: it is carried by the
player or any peer, however it got there (found, bought, stolen, gifted, won). The
engine checks this after every committed beat; the DM never decides it. If a peer takes
the quill for their own agenda, the episode still ends, and that fact is recorded in
the graph as a hook for the next episode.

The episode has no fail state. If the player character drops to 0 HP they are
unconscious (5e death saves are out of scope); the DM narrates what happens around them
and play continues when they come round.

### What Episode N must prove

1. The **LLM → Actions → Game State → LLM** loop works. The DM's intentions become
   validated engine actions, the results feed back into the DM, and the narration never
   contradicts state.
2. The **ontology graph** is populated from a seed, grows during play (generated items,
   NPCs, rumours, relationships) and can be inspected live.
3. **Per-agent knowledge** works. Peers and NPCs act only on what they have perceived or
   been told, and secrets don't leak.
4. **Generators** produce coherent, schema-valid content that the engine can use
   straight away (e.g. a generated item can be picked up).
5. Playing in the tavern is **fun and free-form enough** to justify the architecture.

### Out of scope for Episode N

The overworld and travel, dungeons, more than one building, a day/night or calendar
model, full 5e classes, spell slots and conditions, death saves, character creation,
saving and loading across episodes, audio, multiplayer, and deployment beyond a local
machine.

## Decisions

| Area | Decision | Why |
|---|---|---|
| State authority | **Hybrid.** The engine owns hard mechanics (HP, position, inventory, containers, dice, combat) and exposes them as tools. The DM narrates freely, but creates all content (items, NPCs, containers, facts about the world) only by calling generator tools. Peers have the same powers as the player: they make requests to the DM and have no tools. A fidelity check rejects narration that contradicts game state. | LLMs are good at story and bad at bookkeeping. Content stays consistent because it is always created through a validated path. |
| Runtime | Browser client (Phaser 3 + HTML UI) talks over WebSocket to a Node server that holds the game state, ontology, agent loop and API key. | Keeps the key off the client, allows saving to disk, and lets the agent loop run headless in tests. |
| LLM | Claude, tiered, behind an `LlmProvider` interface we own. Strong model for the DM; fast, cheap models for peers, generators and the critic. Prompt caching for the stable part of the context. | The DM judges and narrates; the other roles are short, well-scoped calls. |
| Player input | Click objects and characters to select them (several at once). Selected things appear as chips in the action bar. Free text says what to do with them ("use [rope] on [trapdoor]"). | Precise references without menus. Text keeps the D&D freedom. |
| Time | Player-driven beats. Each submitted action runs one beat. Nothing happens while the player is idle. | Deterministic and debuggable. Ambient ticks can come later. |
| Peers | 2–3 peers, each with a personality, a private goal and a secret. They only know what they have perceived or been told. | Makes the tavern feel alive and tests knowledge scoping. |
| World seed | A hand-written seed (characters, tavern layout, key NPCs and containers, the quill's true location). Details are generated during play. | Runs can be repeated and compared; the generators still get exercised. |
| Ontology store | Neo4j (Community, Docker) as a projection of an append-only event log. | Real graph queries plus free visual inspection in Neo4j Browser. The log keeps history safe and makes replay possible. |
| Rendering | Phaser 3 for the map, with maps made in Tiled (`.tmj`). React for everything around it. | Tilemaps, sprites, camera and input come built in, and the same engine will serve the overworld later. |
| Art | **Kenney 1-Bit Pack (CC0, 16×16), recoloured to the Codex palette**: dark-brown ink on parchment, red ink for selection and warm accents, so the map reads as an ink illustration on the book's left page. Chosen from a shortlist of four CC0 packs (`mocks/asset-packs/index.html`). Generated entities are mapped to the closest sprite by tag. | One cohesive style for tiles, characters and icons that matches the book UI; the most pieces of any CC0 pack. Trade-off: no animation and less colour, so characters are told apart by name labels and per-role ink tints. |
| Rules | 5e-lite (see [Rules summary](#rules-summary)). | Enough for "do anything" to have consequences, without a full rulebook. |
| Debug visibility | Live ontology graph panel, beat trace / LLM log, replay from the event log, per-agent knowledge view. | Episode N exists to test mechanics, so the machinery must be visible. |
| Language | TypeScript throughout. Zod schemas are the single source of truth for every shape that crosses a boundary (LLM output, tool I/O, network messages, events, seed file); the static types are derived from them. | LLM output is the least trustworthy input in the system. |
| Beat loop | One DM tool-use loop per beat, followed by a critic. |
| UI direction | "Codex": a light parchment book spread. Map, companions and satchel on the left page; the journal and action composer on the right; developer views behind appendix bookmarks and a full Inspector mode. Chosen from four prototypes in `mocks/episode-n-ui/index.html`. | The DM can react to each dice roll during the beat, which is what makes it feel like D&D. |

### Rules summary

- Six ability scores, each with a modifier (`floor((score − 10) / 2)`), and a
  proficiency bonus of +2 for Episode N.
- **Skill checks:** d20 + ability modifier (+ proficiency if proficient) against a DC
  that the DM picks from a fixed scale: 5 / 10 / 15 / 20 / 25. Advantage and
  disadvantage mean rolling 2d20 and keeping the highest or lowest.
- **Opposed checks** for contests (e.g. Stealth vs. Perception, Deception vs. Insight).
- **Combat mode** starts when hostilities begin: roll initiative (d20 + DEX, everyone
  conscious in the room), one action plus one move per turn (using the action ends the
  turn; `pass_turn` ends it without one), attack roll against AC, weapon damage dice. Combat ends when one
  side flees, surrenders or is out of the fight.
- **Spells** are narrative abilities resolved with a check, with no slots.
- **All dice are rolled by the engine** with a seedable random number generator, and
  every roll is shown to the player.

## Glossary

| Term | Meaning |
|---|---|
| **Beat** | One full cycle triggered by a player action: intents → DM loop → critic → commit → broadcast. |
| **Intent** | A request to the DM from the player or a peer: free text plus the referenced entity ids. |
| **Engine tool** | A public engine method the DM can call, such as `skill_check`, `move` or `open_container`. It validates, applies, and returns facts plus events. |
| **Generator tool** | A tool that runs a generator LLM, validates its output, and registers the result in the engine and the ontology. |
| **Hard state** | Mechanics the engine owns: position, HP, AC, inventory, containers, combat. |
| **Soft state** | World meaning the graph owns: attitudes, rumours, lore, goals, secrets, knowledge. |
| **Fact** | An atomic statement about the world, which may be true, false or unknown. |
| **Projection** | Neo4j's copy of the world, derived entirely from the event log. |
| **Knowledge slice** | The subset of the graph a given agent is allowed to see. |

---

## Section 1 — Architecture

### Repository layout

An npm-workspaces monorepo. The current C++/SDL codebase is deleted before work
starts.

```
packages/
  shared/            zod schemas + derived types (no runtime deps beyond zod)
    ontology.ts        node/edge schemas, ids
    events.ts          event log record schemas
    tools.ts           engine + generator tool input/output schemas
    protocol.ts        client↔server WebSocket messages
    seed.ts            episode seed schema
  server/            Node 24 + Fastify + ws
    engine/            hard state + rules, pure: no I/O, no LLM, seedable RNG
      state.ts           in-memory world state
      commands/          one file per engine command (move, transfer, openContainer, check, attack…)
      rules/             dice, checks, combat, perception
      endCondition.ts
    ontology/
      OntologyStore.ts   interface
      Neo4jStore.ts      neo4j-driver implementation
      MemoryStore.ts     in-memory implementation for tests
      projector.ts       event → graph mutation mapping
      eventLog.ts        append-only JSONL writer/reader
      queries/           knowledge slice, DM context, selection context
    agents/
      llm/               LlmProvider interface, AnthropicProvider, ScriptedProvider (tests)
      dm/                DM tool loop, tool registry, prompt assembly
      peers/             peer intent agent
      generators/        item, npc, story
      critic/            fidelity check
    beat/              BeatRunner: orchestrates one beat end to end
    episode/           seed loader, episode lifecycle
    server.ts          HTTP + WebSocket wiring
  client/            Vite + React + Phaser 3
    scenes/            TavernScene (Phaser)
    ui/                React components: layouts, journal, composer, party, satchel, appendix, inspector
    store/             client store + pure reducer for server messages
    net/               WebSocket client, message validation
content/
  episode-n/
    seed.json          characters, items, containers, facts, quests, layout bindings
    tavern.tmj         Tiled map
    sprites.json       tag → sprite frame mapping
  assets/            CC0 tilesets + sprites with LICENSE files
data/                  runtime output (gitignored): event logs, LLM traces
docker-compose.yml     Neo4j
```

### Technology stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict), ES modules |
| Server | Node 24 LTS, Fastify, `ws` |
| Client | Vite, React, Phaser 3 (map only), Tailwind CSS, Zustand (client store), Cytoscape.js (graph view) |
| Validation | zod |
| Graph | Neo4j 5 Community in Docker, `neo4j-driver` |
| LLM | `@anthropic-ai/sdk` behind `LlmProvider` |
| Tests | Vitest |
| Lint/format | ESLint (typescript-eslint, `no-explicit-any` as error) + Prettier |

Exact versions are pinned in `package-lock.json`, which is committed.

### Runtime topology

```
Browser                         Node server                               Docker
┌──────────────────┐  WS   ┌─────────────────────────────────────┐  bolt  ┌────────┐
│ Phaser scene     │◀─────▶│ server.ts ─▶ BeatRunner              │───────▶│ Neo4j  │
│ DOM panels       │       │   ├─ agents (DM, peers, gens, critic)│        └────────┘
└──────────────────┘       │   ├─ engine (in-memory hard state)   │
                           │   └─ ontology (projector, event log) │──▶ data/*.jsonl
                           └──────────────┬──────────────────────┘
                                          │ HTTPS
                                          ▼
                                   Anthropic API
```

### Boundary rules

- **The engine never calls an LLM, and agents never write state directly.** Every
  change goes through an engine command, which validates it, applies it, and returns
  facts and events. This keeps the rules testable without an LLM.
- **Soft state also goes through commands.** The DM changes attitudes, reveals facts or
  spreads rumours with soft-state tools (e.g. `set_attitude`, `share_fact`). Those
  tools emit events like any other; they just skip mechanical validation.
- **`OntologyStore` and `LlmProvider` are interfaces.** Tests use `MemoryStore` and
  `ScriptedProvider`, so the whole beat loop runs in CI with no network and no Docker.
- **The engine holds hard state in memory; the graph mirrors it.** Each committed beat
  appends its events to the log and projects them to Neo4j.
- **The client is a thin view.** It sends `{selection, text}` and renders the events
  the server broadcasts. It never computes game outcomes.

### Model tiers

| Role | Tier | Calls per beat |
|---|---|---|
| DM | Opus 5.5, medium effort | 1 tool loop, up to 8 tool calls; +1 retry if the critic rejects |
| Peer intent | Sonnet 5.5, low effort | 1 per peer whose turn it is |
| Generators (item, npc, story) | Sonnet 5.5 (low effort; medium for story) | 0..n, only when the DM calls them |
| NPC voice | Sonnet 5.5, low effort | 1 per speaking NPC (via `voice_npc`) |
| Critic | Sonnet 5.5, low effort | 1 (+1 after a retry) |

Model ids live in one config file; changing a tier is a config change, not a code
change. Prompts put the stable content (rules, tool schemas, persona, seed lore) first,
so prompt caching can reuse it across beats.

### Beat loop

1. **Receive.** The client sends `player_intent {selection: EntityId[], text}`. The
   server validates it and rejects ids that don't exist or aren't visible to the
   player.
2. **Peer intents.** Each peer gets a short call with its knowledge slice, the player's
   intent and what just happened. It returns either `{intent}` or `{pass}`. Peers act
   in a fixed rotation, at most one or two per beat for Episode N, so turns stay fast.
   A peer's spoken `say` line is sent to the client straight away as a provisional
   `beat_progress` message (see [Mid-beat feedback](#mid-beat-feedback)).
3. **DM tool loop.** The DM receives its context (ground truth around the player,
   recent events, all intents) and runs a tool-use loop. Each tool call is validated
   against its zod schema and executed by the engine or a generator. The result (facts
   + events) goes back to the DM. The loop is capped at 8 tool calls.
4. **Narrate.** The DM ends the beat by calling `narrate {text, lines[]}`. NPC dialogue
   in `lines[]` must reference lines produced this beat by `voice_npc` (see
   [NPC voices](#npc-voices)); the DM never writes an NPC's words itself. If the DM hits
   the cap without narrating, it gets one more turn with the same tools and
   `tool_choice: auto`, plus an instruction to narrate now. Changing `tool_choice` would
   invalidate the prompt cache.
5. **Critic.** A fast model receives the narration and the facts produced this beat,
   plus the ground-truth state of every entity mentioned. It returns
   `{ok: true}` or `{ok: false, issues[]}`. On a rejection, the DM gets one retry with
   the issues attached. The retry is narration-only, except for `unbacked_outcome`
   issues, where it may make up to 2 more tool calls (still validated by the engine)
   so a missing state change can be made rather than just deleted.
   If the retry is also rejected, the narration is replaced by a neutral summary built
   from the events, and the incident is flagged in the beat trace.
6. **Commit.** Events buffered during the beat are appended to the event log and
   projected to Neo4j. The engine state was already updated by the commands, and every
   command is checked against the in-memory state as it runs. If the beat aborts before
   commit (e.g. an unrecoverable API error), the engine rolls back to its snapshot from
   the start of the beat.
7. **End check.** The engine checks the end condition.
8. **Broadcast.** The server sends `beat_result {events, narration, rolls, trace_id}`
   to the client, plus `episode_ended` if the end condition was met.

### Worked example

> The player selects **[loose floorboard]** and **[Brann, the barkeep]** and types:
> "While Brann is busy with the drunk, I pry up the floorboard."

1. The peer rotation gives Ilsa (the rogue) a turn. Her intent: "I keep Brann talking
   so he doesn't notice."
2. The DM calls `contested_check {actor: ilsa, skill: deception, target: brann,
   target_skill: insight}` → Ilsa 17 vs. Brann 9, success.
3. The DM calls `skill_check {actor: player, skill: sleight_of_hand, dc: 10}` → 14,
   success.
4. The DM calls `open_container {actor: player, container: container:floorboard}` →
   the engine reports contents `[item:wax-sealed-letter]`. This container doesn't hold
   the quill, but the seed put a letter in it.
5. The DM wants the letter to point somewhere, so it calls `share_fact {to: player,
   fact: fact:letter-mentions-cellar}`, a fact that already exists in the seed.
6. The DM calls `narrate {...}`, describing Ilsa's distraction, the creak of the board
   and the letter's red wax seal.
7. The critic checks: the narration mentions a letter, and the event contents include
   `item:wax-sealed-letter`. OK.
8. Commit: events `CheckRolled ×2`, `ContainerOpened`, `FactLearned`, `NarrationCommitted`.
   Brann does not get a `WITNESSED` edge for `ContainerOpened` because he lost the
   contested check (see [Perception](#perception-rule)).

### Client ↔ server protocol

All messages are JSON, validated with zod on both ends.

| Direction | Message | Payload |
|---|---|---|
| C→S | `hello` | `{episodeId, lastSeenBeat?}`; `lastSeenBeat` lets a reconnecting client receive what it missed |
| S→C | `world_snapshot` | entities visible to the player, map id, party, inventory, recent narration |
| C→S | `player_intent` | `{selection: EntityId[], text: string}` |
| S→C | `beat_started` | `{beat}`, so the UI can show a "DM is thinking" state |
| S→C | `beat_progress` | Provisional, uncommitted feedback during a beat: a peer's spoken line, or a map cue (a character turns to look at something). Never rolls, movement or narration |
| S→C | `beat_result` | `{beat, events, narration, rolls, traceId}`. `events` contains only events the player witnessed (plus a ground-truth overlay in dev mode) |
| S→C | `episode_ended` | `{beat, holder: EntityId, summary}` |
| C→S | `debug_request` | `{kind: 'trace'\|'knowledge'\|'graph', target?}` |
| C→S | `session_command` | `{command: 'retry_now'\|'save_and_quit'\|'raise_budget'}`, the player's answer to a pause |
| S→C | `paused` / `resumed` | Pause reason, beat, attempt and time to the next automatic retry / the beat being resumed (see Section 5) |
| S→C | `debug_response` | the requested trace, knowledge slice or subgraph |
| S→C | `error` | `{code, message}` |

The client sends one intent at a time; the action bar is disabled between
`beat_started` and `beat_result`.

---

## Section 2 — Data model

The graph described here is intentionally small. It is enough to test the loop in
Episode N; a much richer ontology will come later (see
[Known limits](#known-limits-and-future-growth)).

### Principles

1. **The event log is the canonical history.** Every state change is an event.
   Neo4j is a projection of the log, so it can be wiped and rebuilt from it at any time
   (`npm run graph:rebuild`). That keeps replay reliable, and a schema change never
   loses a session.
2. **Ownership is explicit.** Each property and edge is owned by either the engine
   (hard) or the graph (soft). The projector writes both, but only from events.
3. **Everything has provenance.** Every node and edge records who created it and in
   which beat.
4. **Stable, readable ids.** `<label>:<slug>`, e.g. `char:ilsa`, `item:brass-key`,
   `loc:cellar`. Generated entities get a slug from their name plus a short suffix if
   needed (`item:silver-thimble-2`).

### Common node properties

Every node has:

| Property | Type | Notes |
|---|---|---|
| `id` | string | Unique, `<label>:<slug>` |
| `name` | string | Display name |
| `summary` | string | One or two sentences, used in prompts |
| `tags` | string[] | Free-form; also used to pick a sprite (`["quill","magical","feather"]`) |
| `createdBy` | `seed \| engine \| dm \| generator:item \| generator:npc \| generator:feature \| generator:story` | Provenance |
| `createdAtBeat` | int | 0 for seed |

### Node labels

#### `Character`

| Property | Type | Owner | Notes |
|---|---|---|---|
| `role` | `player \| peer \| npc` | seed/generator | |
| `abilities` | `{str,dex,con,int,wis,cha}` | engine | Scores 3–20 |
| `proficiencies` | string[] | engine | Skill names |
| `hp`, `maxHp`, `ac` | int | engine | |
| `conscious` | bool | engine | |
| `hidden` | bool | engine | Set by a successful Stealth action |
| `gold` | int | engine | Coins carried; spent by `transfer_item` with reason `buy` |
| `personality` | string | graph | Traits, voice, mannerisms |
| `background` | string | graph | |
| `appearance` | string | graph | Used for narration and sprite tagging |

#### `Item`

| Property | Type | Owner | Notes |
|---|---|---|---|
| `kind` | `weapon \| armor \| tool \| trinket \| document \| consumable \| treasure` | generator | |
| `rarity` | `common \| uncommon \| rare \| very_rare \| legendary` | generator | |
| `magical` | bool | generator | |
| `properties` | string[] | generator | Mechanical hooks, e.g. `"advantage on forgery checks"` |
| `damage` | string? | generator | Dice expression for weapons, e.g. `"1d6"` |
| `weight`, `value` | number | generator | Value in gold pieces |
| `hidden` | bool | engine | Not visible until revealed |
| `findDc` | int? | seed/generator | DC a `search` check must meet to reveal it while hidden |
| `questCritical` | bool | seed | `true` for the quill |

#### `Location`

| Property | Type | Owner | Notes |
|---|---|---|---|
| `kind` | `building \| room \| spot` | seed | Regions arrive with the overworld |
| `tileBounds` | `{x,y,w,h}` | seed | Rectangle in the Tiled map |
| `lit` | bool | engine | Affects Perception (disadvantage in darkness) |

Locations nest with `PART_OF`: `loc:tavern` › `loc:common-room` › `loc:hearth`.

#### `Container`

| Property | Type | Owner | Notes |
|---|---|---|---|
| `locked` | bool | engine | |
| `lockDc` | int? | seed/generator | |
| `opened` | bool | engine | |
| `hidden` | bool | engine | E.g. the loose floorboard is hidden until found |
| `findDc` | int? | seed/generator | DC a `search` check must meet to reveal it while hidden |
| `tile` | `{x,y}` | seed/generator | Position on the map |

#### `Faction`

| Property | Type | Owner |
|---|---|---|
| `ideals` | string | seed/generator |
| `standing` | string | graph |

#### `Quest`

| Property | Type | Owner | Notes |
|---|---|---|---|
| `kind` | `episode \| personal` | seed | `episode` = find the quill; `personal` = a peer's private goal |
| `objective` | string | seed | |
| `status` | `active \| complete \| failed \| abandoned` | engine/graph | The episode quest is completed by the engine only |

#### `Fact`

| Property | Type | Owner | Notes |
|---|---|---|---|
| `statement` | string | seed/generator/dm | One atomic claim: "The quill was hidden by the previous owner, a forger named Odo." |
| `truth` | `true \| false \| unknown` | seed/generator | Rumours can be false |
| `kind` | `lore \| rumour \| secret \| observation \| backstory` | | `backstory` facts are an item's or character's history |

#### `Event`

| Property | Type | Notes |
|---|---|---|
| `beat` | int | |
| `seq` | int | Order within the beat |
| `type` | event type (see [Event catalogue](#event-catalogue)) | |
| `summary` | string | One line, readable by people and prompts |
| `private` | bool | Only the actor and targets witness it |
| `roll` | `{expr, rolls[], total, dc?, outcome}`? | For checks and attacks |

`Event` nodes are projected for memory queries ("what did Brann see?"). The full
payload stays in the event log.

### Edges

| Edge | From → To | Properties | Owner | Created by |
|---|---|---|---|---|
| `PART_OF` | Location → Location | | seed | seed |
| `LOCATED_IN` | Character \| Container \| Item → Location | | engine | `move`, generators |
| `CARRIES` | Character → Item | | engine | `transfer_item`, `pick_up` |
| `EQUIPPED` | Character → Item | `slot` | engine | `equip` |
| `CONTAINS` | Container → Item | | engine | seed, `transfer_item`, `generate_item` |
| `MEMBER_OF` | Character → Faction | `rank?` | graph | seed, `generate_npc` |
| `ATTITUDE` | Character → Character | `value` (−100..100), `reason` | graph | seed, `set_attitude` |
| `WANTS` | Character → Item \| Quest | `why` | graph | seed, generators |
| `PURSUES` | Character → Quest | | graph | seed |
| `HAS_SECRET` | Character → Fact | | graph | seed, `generate_npc` |
| `ABOUT` | Fact → any node | | graph | whoever creates the fact |
| `ORIGIN_OF` | Fact → Item \| Character | | graph | `generate_item`, `generate_npc` |
| `KNOWS` | Character → Fact | `since` (beat), `source` (`seed \| witnessed \| told \| deduced \| read`), `confidence` (0–1), `retractedAtBeat?` | graph | seed, `share_fact`, perception |
| `SUPERSEDES` | Fact → Fact | | graph | `create_fact`, `generate_story` (a new fact that corrects or replaces an older one) |
| `WITNESSED` | Character → Event | | engine | perception rule on commit |
| `INVOLVES` | Event → any node | `role` (`actor \| target \| item \| location`) | engine | on commit |

Every edge also carries `createdBy` and `createdAtBeat`.

### Hard-state mirroring

The engine keeps hard state in a plain in-memory structure for speed and simplicity:

```ts
interface EngineState {
  beat: number;
  rngSeed: string;
  characters: Map<EntityId, { locationId; tile; hp; maxHp; ac; abilities; proficiencies; conscious; hidden; gold; inventory: EntityId[]; equipped: Record<Slot, EntityId> }>;
  containers: Map<EntityId, { locationId; tile; locked; lockDc?; opened; hidden; findDc?; contents: EntityId[] }>;
  items: Map<EntityId, { hidden; findDc?; questCritical; holder: { kind: 'character' | 'container' | 'location'; id: EntityId } }>;
  combat: null | { order: EntityId[]; turn: number; round: number };
}
```

Every engine command mutates this structure and returns events. The projector turns
those events into graph writes, so after each commit the hard properties and edges in
Neo4j match `EngineState` exactly. A consistency check (`npm run graph:verify`)
compares the two and is run in tests.

On startup the engine state is rebuilt by replaying the event log from the seed. The
graph is not read back into the engine.

### Event log

One JSONL file per session: `data/sessions/<sessionId>/events.jsonl`. Each line is
one record:

```json
{
  "v": 1,
  "sessionId": "2026-10-24T18-02-11Z",
  "beat": 12,
  "seq": 3,
  "type": "ContainerOpened",
  "actor": "char:player",
  "payload": { "containerId": "container:floorboard", "revealed": ["item:wax-sealed-letter"] },
  "private": false,
  "witnesses": ["char:player", "char:ilsa", "char:doran"],
  "createdBy": "engine",
  "traceId": "beat-12"
}
```

`witnesses` is computed by the perception rule at commit time and stored, so replay
never has to recompute it.

Projection is idempotent: every graph write is a `MERGE` keyed on the event id
(`event:<beat>-<seq>`), so retrying a projection never duplicates anything.

A beat is committed atomically. Its events are appended with one write and an
`fsync`, followed by a `BeatCommitted` marker. On replay, a beat without its marker is
discarded. Neo4j projection happens after the log write; if it fails, the log is still
correct and the projection is retried or rebuilt.

#### Event catalogue

| Event | Hard/soft | Graph effect |
|---|---|---|
| `SeedLoaded` | both | Creates every seed node and edge |
| `BeatStarted` | — | — |
| `IntentReceived` | — | `Event` node (actor = player or peer) |
| `EntityMoved` | hard | Replace `LOCATED_IN`; update `tile`. The payload carries the tile path computed by the engine, which the client animates |
| `ItemTransferred` | hard | Replace `CARRIES` / `CONTAINS` / `LOCATED_IN` for the item |
| `ItemEquipped` / `ItemUnequipped` | hard | `EQUIPPED` edge |
| `ContainerOpened` / `ContainerUnlocked` | hard | Update container properties; reveal contents (`hidden=false`) |
| `EntityRevealed` / `EntityHidden` | hard | Update `hidden` |
| `CheckRolled` | hard | `Event` node with `roll` |
| `AttackResolved` | hard | `Event` node with `roll` |
| `DamageApplied` / `Healed` | hard | Update `hp`, `conscious` |
| `CombatStarted` / `CombatEnded` | hard | `Event` node |
| `TurnAdvanced` | hard | None in the graph; it keeps combat turn order reconstructible when the engine replays the log |
| `EntityCreated` | both | New node + edges (from a generator) |
| `FactCreated` | soft | `Fact` node + `ABOUT` / `ORIGIN_OF` |
| `FactLearned` | soft | `KNOWS` edge. If the learned fact `SUPERSEDES` a fact the character already knows, the old `KNOWS` edge gets `retractedAtBeat` |
| `AttitudeChanged` | soft | Upsert `ATTITUDE` |
| `QuestStatusChanged` | soft (episode quest: hard) | Update `status` |
| `NarrationCommitted` | — | `Event` node with narration summary |
| `CriticRejected` | — | Trace only, not projected |
| `EpisodeEnded` | hard | Update the episode quest; `Event` node |
| `BeatCommitted` | — | — |

### Knowledge model

#### Perception rule

When an event commits, the engine computes its witnesses:

1. Start with every character in the same room as the event's location.
2. Remove characters that are unconscious.
3. If the event is `private` (whispering, a hidden action), keep only the actor and
   the explicit targets.
4. If the actor won a contested Stealth or Sleight of Hand check this beat against a
   character, remove that character.
5. In an unlit room, characters without darkvision only witness events that involve
   them directly.

Each witness gets a `WITNESSED` edge to the `Event` node. For `observation`-worthy
events (an item revealed, a container opened), the engine also creates a `Fact` of
kind `observation` and gives each witness a `KNOWS {source: witnessed}` edge.

#### Telling and rumours

`share_fact {from, to, factId}` creates `KNOWS {source: told}` from the recipient to
an existing `Fact`. The `Fact` itself is not copied, so following `KNOWS` edges shows
how a rumour spread. A character can be told a false fact; `truth` stays on the `Fact`
and `confidence` stays on the edge.

#### Deduction and reading

- `deduced`: when the DM rules that a character works something out (e.g. after an
  Investigation check), it calls `share_fact` with `source: deduced`.
- `read`: reading a document item gives `KNOWS {source: read}` for every `Fact` that has
  `ABOUT` pointing to that document.

### Context queries

Every agent prompt is built from one of three queries. The per-agent knowledge view in
the debug panel calls the same functions, so what you see is exactly what the agent was
given.

**Knowledge slice** (peers and NPCs). Three queries, run in one read transaction; they
can't be combined with `UNION` because they return different columns:

```cypher
// 1. Facts the character knows (retracted ones are rendered as "used to believe")
MATCH (c:Character {id: $id})-[k:KNOWS]->(f:Fact)
RETURN f, k

// 2. Recent events they witnessed
MATCH (c:Character {id: $id})-[:WITNESSED]->(e:Event)
WHERE e.beat >= $sinceBeat
RETURN e ORDER BY e.beat DESC, e.seq DESC LIMIT $recent

// 3. What they can see right now
MATCH (c:Character {id: $id})-[:LOCATED_IN]->(room:Location)<-[:LOCATED_IN]-(x)
WHERE coalesce(x.hidden, false) = false
RETURN x
```

Plus the character's own sheet, `ATTITUDE` edges, `PURSUES` quests, `HAS_SECRET`
facts and inventory.

**DM context:** ground truth. That includes every entity in the player's room and the
rooms next to it (hidden ones included), every quest (with the quill's true location),
the last N events, and the selection context below.

**Selection context:** for each entity the player selected, the entity's node plus
its 1-hop neighbourhood, with the facts it knows if it's a character, or its
`ORIGIN_OF` backstory if it's an item. The DM gets the ground-truth version; the
player-facing UI only shows what the player character knows.

**Leak check:** in tests and in a debug-mode assertion, every peer prompt is scanned
for `Fact` ids or statements that the peer has no `KNOWS` edge for. A match fails the
test or flags the beat.

### Neo4j setup

- `docker-compose.yml` runs `neo4j:5-community` with a named volume, Bolt on
  `localhost:7687`, Browser on `localhost:7474`. Credentials come from `.env` (with an
  `.env.example`), never from source.
- Constraints and indexes, applied on startup:

```cypher
CREATE CONSTRAINT character_id IF NOT EXISTS FOR (n:Character) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT item_id      IF NOT EXISTS FOR (n:Item)      REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT location_id  IF NOT EXISTS FOR (n:Location)  REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT container_id IF NOT EXISTS FOR (n:Container) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT faction_id   IF NOT EXISTS FOR (n:Faction)   REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT quest_id     IF NOT EXISTS FOR (n:Quest)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT fact_id      IF NOT EXISTS FOR (n:Fact)      REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT event_id     IF NOT EXISTS FOR (n:Event)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT entity_id    IF NOT EXISTS FOR (n:Entity)    REQUIRE n.id IS UNIQUE;
CREATE INDEX event_beat IF NOT EXISTS FOR (n:Event) ON (n.beat);
```

- Every node also gets an `Entity` label, so "any node by id" lookups use one index.
- `Event` node ids are `event:<beat>-<seq>`.
- Each session uses its own Neo4j database where the edition allows it. On Community
  (one user database), `graph:rebuild` wipes the graph and replays the chosen
  session's log.

### Episode N seed outline

`content/episode-n/seed.json` is validated by `shared/seed.ts`. The contents below show
the intended shape and cast; final names and text are written when the seed is
authored.

| Kind | Count | Examples |
|---|---|---|
| Locations | 1 building, 5 rooms, ~8 spots | Tavern › common room (hearth, bar, loose floorboard), kitchen, cellar, two upstairs rooms |
| Player | 1 | A mid-level adventurer with a background, 3–4 items, a personal reason to want the quill |
| Peers | 3 | A rogue in debt to the barkeep; a cleric whose temple wants the quill; a fighter with a grudge against a local faction |
| NPCs | 4–5 | Barkeep, a bard, a drunk regular, a cook, a hooded stranger who also seeks the quill |
| Containers | 6–8 | The loose floorboard, a locked strongbox behind the bar, cellar barrels, a wardrobe upstairs |
| Items | ~15 | Party gear, a wax-sealed letter, a cellar key, the quill |
| Facts | ~20 | Lore about the quill, true and false rumours, each peer's secret, NPC secrets |
| Quests | 1 episode + 3 personal | Find the quill; each peer's private goal |
| Factions | 2–3 | The cleric's temple, the faction the fighter hates, a thieves' guild |

The quill is placed in one container that takes at least two discoveries to reach
(e.g. the cellar key is held by the barkeep, and the right barrel is only found with a
successful Investigation check). Facts about the location are spread across several
NPCs, so different play styles (talking, sneaking, fighting) all lead somewhere.

Example seed fragment:

```json
{
  "items": [
    {
      "id": "item:quill",
      "name": "The Inkless Quill",
      "summary": "A raven-black quill that writes without ink.",
      "kind": "tool",
      "rarity": "rare",
      "magical": true,
      "properties": ["writes without ink", "advantage on forgery checks"],
      "weight": 0,
      "value": 500,
      "hidden": true,
      "questCritical": true,
      "tags": ["quill", "feather", "magical"],
      "holder": { "kind": "container", "id": "container:cellar-barrel-3" }
    }
  ],
  "facts": [
    {
      "id": "fact:odo-hid-quill",
      "statement": "Odo the forger hid the quill in the cellar before he fled.",
      "truth": true,
      "kind": "lore",
      "about": ["item:quill", "loc:cellar"],
      "knownBy": [{ "character": "char:brann", "confidence": 0.6 }]
    }
  ]
}
```

### Known limits and future growth

Deliberately left out of the Episode N graph:

- **Time:** no in-world clock, day/night or calendar. Beats are the only timeline.
- **Space:** a single building; no regions, routes or travel edges.
- **History:** no validity intervals on facts. A correcting fact `SUPERSEDES` the old
  one and retracts the old `KNOWS` edges as characters learn it (a scaled-down version
  of Zep's edge invalidation); a full bi-temporal model comes later.
- **Forking:** no "fork from beat N" for replaying a session's history with changed
  prompts. Planned after Episode N.
- **Retrieval:** no embeddings or semantic search (hybrid BM25 + graph retrieval is the planned next step). Context is built only from graph
  queries.
- **Relationships:** a single numeric `ATTITUDE`. No reputation, debts or bonds as
  first-class nodes.

The planned richer ontology adds temporal facts, a geography layer for the overworld,
first-class relationships and reputation, and semantic retrieval over facts and
events. Because Neo4j is a projection of the event log, these can be added by writing
new projections without migrating stored history.

---

## Section 3 — Agents and tools

### Agent roster

| Agent | Tier | Sees | Can do |
|---|---|---|---|
| **DM** | Opus 5.5, medium effort | Ground truth around the party, all intents, recent events, the knowledge slice of every NPC present | Call engine, soft-state, generator, `voice_npc` and terminal tools. Decides when NPCs speak and what they're after, but never writes their words. |
| **NPC voice** | Sonnet 5.5, low effort | One NPC's knowledge slice, persona and the DM's direction only | Return one line of dialogue for that NPC |
| **Peer** (×3) | Sonnet 5.5, low effort | Its own knowledge slice only | Return one intent or pass. No tools. |
| **Item / NPC / Feature generator** | Sonnet 5.5, low effort | The DM's brief plus a small graph excerpt | Return one schema-valid entity with its backstory facts |
| **Story generator** | Sonnet 5.5, medium effort | The DM's brief plus related facts | Return new facts consistent with existing lore |
| **Critic** | Sonnet 5.5, low effort | Narration, this beat's events, ground truth of mentioned entities, the player's and speaking NPCs' knowledge | Return OK or a list of issues |

#### NPC voices

NPCs are not full agents in Episode N, but they speak through their own calls. The DM
calls `voice_npc {npc, direction}` with what the NPC is trying to do ("Brann deflects,
hints at the old stock"). A fast model that sees **only that NPC's knowledge slice and
persona** writes the line. The DM can't leak what the NPC doesn't know, because the
call that writes the words never sees it. Prompted secrecy leaks often (39–57% in
ConfAIde); isolation does not. The critic still checks the line. Promoting key NPCs
to full agents with their own intents is a later step.

### Tool registry

Every tool is declared once in `packages/shared/tools.ts`:

```ts
interface ToolDefinition<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: string;
  kind: 'engine' | 'soft' | 'generator' | 'terminal';
  description: string;       // written for the LLM: when to use it and what it must not be used for
  input: I;                  // zod schema; converted to JSON Schema for the Anthropic tool definition
  output: O;
  handler: (input: z.infer<I>, ctx: BeatContext) => Promise<ToolResult<z.infer<O>>>;
}

type ToolResult<T> =
  | { ok: true; value: T; events: GameEvent[]; facts: string[] }   // facts: plain-language statements fed back to the DM
  | { ok: false; error: { code: string; message: string } };       // message names the bad value and what was expected
```

Rules that apply to every tool call:

- The input is parsed with zod before the handler runs. A parse failure is returned to
  the DM as an `is_error` tool result, so it can correct itself. It still counts
  toward the per-beat cap.
- Handlers don't change engine state until validation passes. A rejected call has no
  side effects.
- Every call, its input, its result and its latency are recorded in the beat trace.
- **Strict schemas, within the API's limits.** Tool definitions are sent with
  `strict: true` where possible, but the API caps a request at 20 strict tools, 16
  union-typed parameters across them, and a maximum compiled grammar size. Measured
  against the live API, 14 tools fit: move, skill_check, search, open_container,
  unlock_container, transfer_item, attack, apply_damage, hide, heal, set_attitude,
  share_fact, voice_npc and narrate. The rest (contested_check, pass_turn,
  end_combat, equip, unequip, set_quest_status, create_fact and the generators) are
  sent without strict mode. All inputs are zod-validated either way. Optional fields
  are left out of `required` rather than modelled as nullable unions.
  `npm run llm:tools-check` confirms the API accepts the whole set.
- **Check receipts.** Checks return a `checkId`. Tools whose outcome depends on a roll
  (`unlock_container` by lockpicking or force, `search`, `transfer_item` with reason
  `steal`, `hide`) require a `checkId` from this beat with a successful outcome for the
  same actor. The DM therefore can't give the player a success without rolling for it.

### Per-beat limits

| Limit | Value |
|---|---|
| Tool calls per DM loop | 8 (`narrate` excluded) |
| Generator calls per beat | 3 |
| New NPCs per episode | 12 |
| Rarity of generated items | `rare` at most (seed items are exempt) |
| Value of generated items | 500 gp at most |
| Attitude change per call | −30..+30 |
| `voice_npc` calls per beat | 4 (not counted toward the tool-call cap) |
| Tool calls on a critic retry | 0, or 2 for `unbacked_outcome` |

Limits live in one config object and are enforced by the handlers, not by prompts.
They are deliberately loose for Episode N, to see what the DM does with room to
improvise. Generated loot can match the quill in rarity and value; the quill stays
special because of its story and its `questCritical` flag, not its price.

### Tool catalogue

#### Engine tools (hard state)

| Tool | Input | Validation | Events |
|---|---|---|---|
| `move` | `actor`, `to` (location or entity id) | Actor conscious, not in combat (or uses their combat move); target in the tavern; path not blocked by a locked door | `EntityMoved` |
| `skill_check` | `actor`, `skill` or `ability`, `dc` (5/10/15/20/25), `advantage` (`none\|advantage\|disadvantage`), `reason` | Actor conscious | `CheckRolled` → returns `checkId`, total, outcome |
| `contested_check` | `actor`, `skill`, `target`, `targetSkill`, `reason` | Both present and conscious | `CheckRolled` (both rolls) → `checkId`, winner |
| `search` | `actor`, `area` (location id), `checkId` | The check is a successful Perception or Investigation by `actor` this beat | `EntityRevealed` for each hidden entity in the area whose `findDc` ≤ check total |
| `open_container` | `actor`, `container` | Same room, not hidden, not locked | `ContainerOpened` (reveals contents) |
| `unlock_container` | `actor`, `container`, `method` (`key\|lockpick\|force`), `itemId?`, `checkId?` | `key`: the actor carries the matching key. `lockpick`/`force`: a successful check whose total ≥ `lockDc` | `ContainerUnlocked` |
| `transfer_item` | `item`, `to` (character, container or location), `actor`, `reason` (`pick_up\|give\|drop\|steal\|buy\|loot`), `checkId?`, `price?` | Item reachable by the actor; `steal` needs a successful check; `buy` needs enough `gold` and a willing seller; `loot` needs the holder to be unconscious | `ItemTransferred` (+ gold movement for `buy`) |
| `equip` / `unequip` | `actor`, `item`, `slot` | Actor carries the item | `ItemEquipped` / `ItemUnequipped` |
| `hide` | `actor`, `checkId` | Successful Stealth check | `EntityHidden` |
| `attack` | `attacker`, `target`, `weaponId?` | Both present; starts combat if none is active; it must be the attacker's turn in combat | `CombatStarted?`, `AttackResolved`, `DamageApplied?` |
| `apply_damage` | `target`, `dice`, `cause` | For environmental harm only (falls, fire, poison); not usable as an attack | `DamageApplied` |
| `heal` | `target`, `dice`, `source` (item id, `rest`, or `{checkId}`) | An item source must be a consumable carried by someone present; a `{checkId}` source is the cleric's narrative healing ability and needs a successful check by the healer this beat | `Healed` |
| `pass_turn` | `actor` | Combat is active and it is `actor`'s turn; ends the turn without an action | `TurnAdvanced` |
| `end_combat` | `reason` (`fled\|surrendered\|defeated\|talked_down`) | Combat is active | `CombatEnded` |

The engine refuses to move a `questCritical` item except through an actor-driven
`transfer_item`. The quill can't be teleported, destroyed or created by the DM.

#### Soft-state tools

| Tool | Input | Validation | Events |
|---|---|---|---|
| `set_attitude` | `from`, `to`, `delta`, `reason` | Both characters exist; delta within limits | `AttitudeChanged` |
| `share_fact` | `from?`, `to[]`, `factId`, `source` (`told\|deduced\|read\|witnessed`) | The fact exists; `from` knows it (if given); recipients are present | `FactLearned` per recipient |
| `create_fact` | `statement`, `truth`, `kind` (`rumour\|observation\|lore`), `about[]`, `knownBy[]`, `supersedes?` (fact id) | Referenced entities exist; `kind` is not `secret` or `backstory` (those come from generators); **`about` may not include a `questCritical` entity**: facts about the quill come only from the seed, so the DM can share them but not invent them | `FactCreated`, `FactLearned` |
| `set_quest_status` | `quest`, `status` | Personal quests only; the episode quest is closed by the engine | `QuestStatusChanged` |

`create_fact` is how the DM writes story freely, as agreed: rumours, observations and
small pieces of lore. Whether a new fact contradicts existing ground truth is checked
by the critic, not by the engine.

#### Generator tools

| Tool | Input | Produces |
|---|---|---|
| `generate_item` | `brief` ("a trinket a nervous merchant would hide"), `placement` (container, character or location id), `constraints?` (`kind`, `maxRarity`) | `Item` + 1–2 `backstory` facts (`ORIGIN_OF`) |
| `generate_npc` | `brief`, `locationId`, `hints?` (`role`, `attitudeToParty`) | `Character` (role `npc`) with stats, personality, appearance, 1 secret fact, attitude edges, optional starting items (through the item generator rules) |
| `generate_feature` | `brief` ("a trapdoor under the rug"), `locationId`, `hidden?`, `locked?` | `Container` with `tile`, `findDc`, `lockDc` as needed. It always starts empty. |
| `generate_story` | `brief`, `about[]`, `kind` (`lore\|backstory\|rumour`) | 1–3 facts consistent with the related facts it was shown |

#### Terminal tool

| Tool | Input | Effect |
|---|---|---|
| `voice_npc` | `npc`, `direction` (what the NPC is trying to do or say, ≤ 40 words) | Returns `{lineId, text}`, written by the NPC voice agent from the NPC's knowledge slice. Doesn't count toward the tool cap; at most 4 per beat |
| `narrate` | `text` (≤ 180 words, second person for the player), `lines[]`: peer and NPC dialogue, where an NPC line is `{lineId}` from `voice_npc` and a peer line is `{speaker, text}` taken from that peer's `say`; `mood?` (`calm\|tense\|comic\|ominous`) | Ends the tool loop and hands off to the critic |

### Generator pipeline

Every generator follows the same steps:

1. **Context.** Build a small prompt from the brief plus a graph excerpt: the target
   location and what's in it, facts `ABOUT` the referenced entities, the names of
   existing entities, and the session's most-used tags ("recently used motifs: socks,
   ravens…") so generated content doesn't keep repeating the same ideas.
2. **Structured output.** Call the model with structured outputs
   (`output_config.format` built from the entity's zod schema), so the response is
   always JSON in that shape. Forced `tool_choice` is not used anywhere: Claude Opus 5.5
   and Claude Sonnet 5.5 reject it.
3. **Validate.** Parse with zod, then apply policy bounds (rarity, value, stat ranges
   for NPCs: ability scores 6–18, HP 4–40, AC 10–17). Then a deterministic
   near-duplicate check: a normalised name matching an existing entity, or high tag
   overlap with an entity of the same kind in the same location, counts as a
   validation failure. Listing names in the prompt alone doesn't prevent duplicates.
4. **Retry once.** On failure, call again with the validation errors in the prompt. If
   it fails again, the tool returns `ok: false` to the DM, which narrates around it.
5. **Register.** Assign an id, resolve a sprite from the tags (falling back to a
   generic sprite per kind), add the entity to the engine (if it has hard state), and
   emit `EntityCreated` plus `FactCreated` events.
6. **Return** a short description to the DM, so it can narrate what was created.

Facts from `generate_story` are also given to the critic in that beat, together with
the `ABOUT` facts the generator was shown, so lore contradictions are caught
(`lore_contradiction`). Every generation updates the session's tag-frequency log,
which feeds step 1 and the eval reports.

### DM agent

#### Prompt structure

The prompt is ordered from most stable to least, so prompt caching reuses as much as
possible:

1. **Role and principles** (cached).
   - You are a fair, generous DM. Say "yes, and" or "yes, but" to creative ideas.
   - Any action with an uncertain outcome needs a check. Never narrate a result that
     wasn't rolled.
   - Never describe an item, NPC or feature that wasn't created by a generator or
     doesn't exist in the state.
   - Narrate only what the player character perceives. Peers' private actions are
     resolved but not shown unless the player witnesses them.
   - Never reveal the quill's location outright. Reward investigation with clues.
   - Treat outcomes a player or peer asserts ("Brann doesn't notice", "I pick the lock")
     as attempts. Only the dice and the engine decide outcomes.
   - Decide the DC from the fixed scale and state it, with the reason, before rolling.
   - When NPCs speak, call `voice_npc` with what they're after; never write their words.
   - Peers are players too: resolve their intents with the same tools and checks.
2. **Rules summary** and **tool usage guide** (cached), with a short example of a
   good beat.
3. **Campaign premise and seed lore** (cached per episode).
4. **Rolling recap** (changes every 10 beats). A fast model rewrites a ~300-word
   "story so far" every 10 beats from the committed events (not from earlier recaps);
   it is stored in the event log as `RecapUpdated`. The recap is atmosphere for the DM
   only; it is never treated as ground truth by the critic or the engine.
5. **Current state** (every beat): the DM context query results, rendered as compact
   text.
6. **This beat**: the player's intent, with the selected entities expanded; peer
   intents; the last 3 narrations.

#### Context budget

The dynamic part (items 5–6) targets 12k tokens or fewer. When it would go over, the
oldest witnessed events are dropped first, then 1-hop neighbours of non-selected
entities. The selection context and the intents are never dropped.

### Peer agent

**Input:** persona (personality, background, voice), private goal, secret, knowledge
slice, attitude towards each party member, inventory, the last narration, and the
player's current intent.

**Output** (structured output, zod-validated):

```ts
type PeerTurn =
  | { kind: 'pass' }
  | { kind: 'intent'; text: string; refs: EntityId[]; say?: string; private: boolean };
```

- `say` is dialogue spoken aloud before the action. It's passed to the DM to include
  in the narration.
- `private: true` marks an action the peer wants to keep hidden (e.g. pocketing
  something). The DM resolves it normally, but the perception rule decides who
  witnesses it, and the narration only shows it if the player does.

**Rotation:** each beat, at most two peers get a turn. Priority goes to (1) peers named
or selected in the player's intent, (2) peers with an unresolved pending action from
the previous beat, (3) round robin. A peer that passes three beats in a row is nudged
in its prompt to pursue its goal.

### Critic

The critic runs after `narrate`, in two stages:

1. **Deterministic pre-check (no LLM).**
   - The narration or a dialogue line names a hidden entity the player hasn't
     discovered → reject.
   - A dialogue line's `speaker` is not present or not conscious → reject.
   - The narration mentions a check outcome ("you succeed", "you fail") and no check
     ran this beat → reject.
   - An NPC dialogue line isn't a `lineId` produced by `voice_npc` this beat → reject.
   - **Unspent receipt:** a successful check whose receipt no tool used this beat, while
     the narration claims the result (taken, opened, hidden, unlocked) → reject as
     `unbacked_outcome`.
2. **LLM check (Sonnet 5.5, low effort), claim by claim.** Input: the narration, this beat's events
   and facts, the ground-truth state of every entity mentioned (by id from the tool
   calls, and by name match against known entities), the player's knowledge slice, the
   knowledge slice of each NPC and peer that speaks, and any `generate_story` facts with
   the facts they were based on. The critic first lists the narration's claims (who
   holds what, where things are, outcomes, who knows what, what happened first) and
   then checks each one, rather than giving one overall verdict. Checking claims
   separately works better than a single judgement (Chain-of-Verification). It
   specifically looks for:
   - **embellishment**: an NPC or peer adding detail to a fact they do know;
   - **real-world knowledge bleed**: a character knowing things from outside the world;
   - **adopted player outcomes**: narration that treats an outcome the player asserted
     as fact without a check;
   - **peer self-leak**: a peer revealing one of its own secrets. That isn't rejected
     (peers may confide); instead it becomes a `FactLearned` for the witnesses and is
     flagged in the trace.

   Output (structured output):

   ```ts
   type CriticVerdict =
     | { ok: true }
     | { ok: false; issues: { type: 'state_contradiction' | 'unbacked_outcome' | 'invented_content'
                                     | 'perspective_leak' | 'npc_knowledge_leak' | 'lore_contradiction'
                                     | 'temporal_contradiction';
                              quote: string; explanation: string }[] };
   ```

On rejection, the DM retries once with the issues attached. The retry is
narration-only, except that `unbacked_outcome` issues allow up to 2 more validated
tool calls. If the retry is also rejected, a neutral narration is built from event
summaries and the beat is flagged in the trace. Rejected text is never shown to the
player.

### LLM provider

```ts
interface LlmProvider {
  complete(request: {
    role: 'dm' | 'peer' | 'npc_voice' | 'generator' | 'story' | 'critic' | 'recap';
    system: { text: string; cache: boolean }[];
    messages: LlmMessage[];
    tools?: ToolSchema[];            // DM loop only; always tool_choice auto, strict schemas
    outputFormat?: ZodSchema;         // structured output for every other role
    maxTokens: number;
    timeoutMs: number;
  }): Promise<LlmResponse>;
}
```

| Role | Model | Effort |
|---|---|---|
| `dm` | `claude-opus-5-5` | `medium` (tuned later by evals) |
| `story` | `claude-sonnet-5-5` | `medium` |
| `peer`, `npc_voice`, `generator`, `critic`, `recap` | `claude-sonnet-5-5` | `low` |

- **Request shape:**
  - Thinking is left to each model's default (adaptive; it can't be turned off on Opus
    5.5), and depth is controlled only by an explicit `effort` per role, because
    Opus 5.5 defaults to `medium` and Sonnet 5.5 to `high`.
  - No `temperature`, `top_p` or `top_k` (rejected by current models).
  - No assistant prefill.
- **Tool loop:** the DM appends each response's full `content` (including thinking
  blocks, unchanged) before sending tool results, so the history stays append-only as
  the models' preserved-thinking check requires. Tool inputs are parsed with zod as
  JSON, never string-matched.
- **No Haiku.** Every role runs on Opus 5.5 or Sonnet 5.5 (user decision, 2026-10-27):
  small, high-volume roles use Sonnet 5.5 at low effort rather than a cheaper tier.
- **Refusals:** every request on a model that offers them (Opus 5.5, Sonnet 5.5) sends
  server-side refusal fallbacks (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`). Every response's
  `stop_reason` is checked before its content is read; a final `refusal` is treated as
  a failed call (the DM narrates around it; nothing is committed from it).
- **Prices** live in config (USD per million tokens), filled from Anthropic's
  published rates: Opus 5.5 $4 in / $20 out / $0.20 cache read; Sonnet 5.5 $2 / $10 /
  $0.20; Haiku 5.5 $0.10 / $0.50 for prompts up to 100K tokens ($0.50 / $2.50
  beyond), cache reads at 0.1× input. Cache writes cost 1.25× input for the 5-minute
  TTL and 2× for the 1-hour TTL. The minimum cacheable prefix on all three is 512
  tokens.

- `role` maps to a model id through config. The DM uses the strong tier; everything
  else runs on Sonnet 5.5 (low effort for small roles, medium for the story generator).
- **Timeouts:** 60 s for DM calls, 20 s for the rest. No unbounded waits.
- **Retries:** HTTP 429, 5xx (including 529 overloaded) and network errors are
  retried twice with exponential backoff and jitter (the SDK's own `maxRetries`, with
  per-request timeouts in milliseconds). That's safe because LLM calls don't change state; state changes
  only happen in tool handlers, which run once per tool call.
- **Prompt caching:**
  - The DM's stable prefix (principles, rules, tools, seed lore) uses the **1-hour
    cache TTL**, because players pause longer than the 5-minute default.
  - The tool list and `tool_choice` never change within a DM loop; changing either
    invalidates the cache.
  - Every call logs cache read and write tokens, and the trace flags a DM call whose
    prefix missed the cache.
  - Prompts shorter than the model's minimum cacheable length are silently not cached,
    so generator prompts are checked against it.
- **Tracing:** a wrapper records the role, model, parameters, a hash of the prompt and
  of the knowledge slice used, token usage (including cache hits), latency and the full
  request and response into
  `data/sessions/<sessionId>/traces/beat-<n>.json`. API keys are never written to logs.
- `AnthropicProvider` is the only file that imports `@anthropic-ai/sdk`.
  `ScriptedProvider` replays canned responses for tests.

---

## Section 4 — Client and UI

The reference for look and layout is the **V3 Codex** prototype in
`mocks/episode-n-ui/index.html`. The other three versions there are kept for
comparison; V4's arrangement is reused for Inspector mode.

### Visual direction

- **Theme:** a light parchment book. Warm paper, dark-brown ink, red-ink accents.
  The pixel art sits in an inked frame on the page, like an illustration.
- **Colour tokens** (defined once in the Tailwind config, used everywhere by name):

| Token | Value | Use |
|---|---|---|
| `paper` | `#f6ecd6` | Page background |
| `paper-deep` | `#efe1c3` | Cards, roll stamps, map frame fill |
| `desk` | `#e9dcc0` → `#d9c7a0` | Background around the book (radial gradient) |
| `ink` | `#2b1d12` | Body text |
| `ink-soft` | `#7a6248` | Secondary text |
| `rule` | `#a08868` / `#c4b08a` | Borders, dashed separators |
| `binding` | `#5a3e2b` | Book edges, frames |
| `red-ink` | `#9b1c1c` | Accent: selection, player intent, headings, active tab |
| `good` / `bad` | `#2f6b3a` / `#9b1c1c` | Roll outcomes, attitude signs |

  Character and type colours (player, peer, npc, item, fact, …) match the graph legend
  in the prototype.
- **Fonts** (Google Fonts): *IM Fell English* for narration and body text,
  *Pixelify Sans* for labels, headings and roll stamps, *JetBrains Mono* for ids and
  traces.
- **Pixel art:** Phaser runs with `pixelArt: true` and `roundPixels: true`. The map is
  drawn at the largest whole-number scale that fits the frame (letterboxed), so pixels
  never blur. UI icons and portraits are the same sprites, also scaled by whole numbers.
- **Motion:** short and quiet. Ink-in narration, a stamp effect for rolls, movement
  tweens on the map. Everything respects `prefers-reduced-motion` (which turns off
  ink-in and tweens).

### Layout: the book

```
┌─ desk ────────────────────────────────────────────────────────────────────────┐
│ ┌─ left page ─────────────────────────┐┌─ right page ─────────────────────┐┌─┐ │
│ │ The Crooked Lantern        beat 13  ││ JOURNAL                           ││G│ │
│ │ ┌─ map frame ─────────────────────┐ ││ — Beat 12 —                       ││r│ │
│ │ │                                 │ ││ You: While Brann is busy…         ││a│ │
│ │ │      Phaser canvas: tavern      │ ││ Ilsa: “Brann, love…”              ││p│ │
│ │ │                                 │ ││ [d20 13] Ilsa · Deception … ✓     ││h│ │
│ │ └─────────────────────────────────┘ ││ The board gives with a dry creak… │├─┤ │
│ │ COMPANIONS          SATCHEL         ││ …                                 ││T│ │
│ │ [Kael ▮▮▮▮▯] AC15   [Longbow]       ││───────────────────────────────────││r│ │
│ │ [Ilsa ▮▮▮▯▯] AC14   [Rope]          ││ [Brann ×] [Old barrel ×]          │├─┤ │
│ │ [Doran ▮▮▮▮▮]       [Letter] new    ││ ✒ I would like to…        [Write] ││K│ │
│ │ [Mael ▮▮▯▯▯]        ◎ 34 gold       ││                                   ││n│ │
│ └─────────────────────────────────────┘└───────────────────────────────────┘└─┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Left page:** location header (name, beat counter), the map frame, then two columns:
  Companions (party cards) and Satchel (player inventory).
- **Right page:** the Journal (scrolling) and, pinned at the bottom, the Composer (the
  selection chips plus the text line).
- **Appendix bookmarks** on the right edge: Graph, Trace, Knowledge. Clicking one opens
  a drawer that covers the right page; clicking it again (or *close*) puts it away.
- **Minimum size:** 1280×800. Below 1100 px wide the pages stack (map page above
  journal page) and the bookmarks become a row of tabs. Episode N doesn't target mobile.

### Inspector mode

The backtick key (`` ` ``) or a small toggle in the header switches to the Inspector
layout, using the same components in a denser arrangement (based on prototype V4, but
in Codex colours):

| Left column | Centre | Right column |
|---|---|---|
| Party, satchel, knowledge slice (agent picker) | Map (top), journal + composer with raw entity ids (bottom) | Ontology graph (top), beat trace (bottom) |

Both layouts read the same store, so switching keeps the selection, scroll position
and any half-typed text.

### React component tree

Components are presentational: they get data and callbacks as props, and only the two
layout components and `MapView` connect to the store.

```
App
├─ BookLayout                      (default)
│  ├─ LeftPage
│  │  ├─ LocationHeader
│  │  ├─ MapView                   Phaser island; bridges scene events ↔ store
│  │  ├─ CompanionsPanel → PartyCard[]
│  │  └─ SatchelPanel → ItemRow[]
│  ├─ RightPage
│  │  ├─ Journal → JournalEntry[]  (BeatHeader | IntentEntry | DialogueLine | RollStamp | Narration | EventNote | EpisodeEndPage)
│  │  └─ Composer → Chip[], text line, Write button
│  ├─ AppendixTabs
│  └─ AppendixDrawer → GraphView | TraceView | KnowledgeView
└─ InspectorLayout                 (toggle)
   └─ same panels, `density="compact"`
```

### Client store

One Zustand store. Every server message goes through a pure reducer, so client
behaviour can be unit-tested without a browser:

```ts
applyServerMessage(state: ClientState, msg: ServerMessage): ClientState
```

| Slice | Contents |
|---|---|
| `connection` | `connecting \| open \| closed`, retry count |
| `world` | entities visible to the player (from `world_snapshot`, kept up to date by beat events), party, inventory, gold, map id |
| `journal` | entries derived from `beat_result` events and narration, plus the reveal state of the newest entry |
| `beat` | `idle \| running \| ended`, current beat number |
| `selection` | ordered `EntityId[]` |
| `composer` | text, history of submitted intents |
| `dev` | `devTools`, `dmView`, `inspector`, open appendix tab, chosen agent, cached traces, graph and knowledge responses |

Message shapes come from `packages/shared/protocol.ts`, so both ends validate the same
zod schemas.

### Selection model

- Clicking toggles an entity in or out of the selection. Click targets: entities on the
  map, party cards, satchel items, chips inside past journal entries (to re-select
  them), and graph nodes in dev views (only for entities the player can see; facts and
  quests open a detail popover instead).
- At most **6** selected entities. A seventh click shows a short "too many" hint.
- **Esc** clears the selection.
- Selected entities get a red-ink outline and name label on the map, and a red ring on
  their card or row.
- The server re-validates every id in `player_intent` (it must exist and be visible to
  the player). The client's view is never trusted.

### Composer

- One text line (≤ 500 characters) with the chips above it. **Enter** or *Write*
  submits `player_intent {selection, text}`. Text without a selection is fine (e.g. "I
  order a round for the room").
- While a beat is running the line is disabled. The selection is cleared after
  submitting.
- **↑** recalls the previous intent for editing.
- **Example verbs.** When chips are selected and the line is empty, the placeholder
  suggests two or three verbs that fit the selection (e.g. a container: "search, open,
  force"; an NPC: "ask, bribe, distract"). They come from a static table by entity kind,
  not an LLM. This helps with the "blank canvas" problem players report in open-input
  games.

### Mid-beat feedback

A beat can take 10–15 s. A passive "thinking" indicator doesn't help much; in a study
of LLM agents, a spinner had no measurable effect while natural fillers did. So the
wait is filled with things happening in the world:

- **Peer lines.** As soon as a peer agent returns a spoken `say` line, the server sends
  it as `beat_progress` and the journal shows it in a lighter, provisional ink. It
  becomes normal ink when the beat commits. If the beat is rolled back, provisional
  lines are struck through, with the pause note.
- **Map cues.** `beat_progress` can also carry harmless cues (a character turns
  toward the selected entity, an NPC glances up), which `MapView` plays as small
  animations.
- **Nothing committal.** Rolls, movement, event notes and narration still appear only
  after commit, so a rolled-back or re-run beat never shows dice that later change.
- If there's no peer line yet, the journal falls back to "The Dungeon Master's quill
  scratches…".

The client measures **time to first feedback** (intent sent → first `beat_progress` or
`beat_result`) and reports it in the beat trace.

### Journal

- **Entry types:**
  - beat header
  - your intent (red ink, italic, with its chips)
  - dialogue lines from peers and NPCs (portrait, name in the type colour)
  - roll stamps (`d20 13 · Ilsa · Deception vs Insight +4 = 17 vs Brann 9 → success`)
  - narration (body serif)
  - event notes (`◆ Wax-sealed letter → your inventory`)
  - an end-of-chapter page
- **Ink-in reveal**, per beat: roll stamps appear first (stamp effect, about 150 ms
  each), then narration writes itself in at about 40 words per second, then dialogue
  lines, then event notes. A click or any key reveals everything at once. The next
  intent can be typed during the reveal.
- **Perspective:** the journal only contains what the player character perceived. The
  server never sends events the player didn't witness, so the client can't show them.
- **Scrolling:** follows new entries unless you've scrolled up, in which case a
  "↓ new entries" marker appears.
- **Critic fallback:** if a beat's narration was replaced by the neutral summary
  (Section 3), it reads as plain text. With dev tools on, a small red-ink marginal note
  says "critic fallback" and links to the trace.

### Map view (Phaser)

- `TavernScene` loads `content/episode-n/tavern.tmj` with layers `floor`, `walls`,
  `furniture` and an `entities` object layer for spawn positions. The whole floor is
  visible from the start (no fog of war).
- **Entities** are sprites chosen from `content/episode-n/sprites.json` by tag. Generated
  entities get the best tag match, with a fallback sprite per kind (npc, item,
  container).
- **Hidden entities are never sent to the client** (see [DM view](#dm-view)), so the
  scene simply doesn't have them until an `EntityRevealed` event arrives.
- **Movement:** `EntityMoved` events carry the tile path computed by the engine. The
  scene tweens the sprite along it at about 8 tiles per second. Several moves in one beat
  play in event order.
- **Feedback:** a red-ink outline and label for selected entities; a small red diamond
  on anything that changed in the last beat (cleared on the next beat); a two-frame idle
  bob for characters if the asset pack provides it.
- **Bridge:** the scene emits `entity-clicked {id}` to the store; it subscribes to
  `selection`, `world` and `journal` changes. Phaser never talks to the network.

### Companions and Satchel

- **Party cards:** portrait sprite, name in the type colour, class and level, AC, HP bar
  and numbers. Unconscious characters are greyed out with a "down" label. Clicking a
  card selects that character.
- **Satchel:** the player's items only (peers' inventories are not something the player
  knows), with icon, name, rarity (colour-coded), and `equipped` / `new` badges, plus
  gold. Clicking an item selects it, so you can type "use [rope] on [trapdoor]".

### Appendix (developer views)

Available while `devTools` is on, which is the default for Episode N.

- **Graph.** Cytoscape.js, fed by `debug_request {kind: 'graph', focus: selection or
  the player, depth: 1}`.
  - Nodes are coloured by type, with the legend from the prototype.
  - Nodes and edges changed in the last beat get a dashed red-ink ring or line.
  - In DM view, edges only the DM knows about are drawn dashed.
  - A node's detail popover shows its properties and provenance (`createdBy`,
    `createdAtBeat`).
  - A link opens the same query in Neo4j Browser.
- **Trace.** One card per beat, newest first:
  - the intents
  - every tool call with ✓/✗, its arguments and its result (rejected calls show the
    engine's error message)
  - the critic verdict, with any issues and retries
  - token counts (with the cache hit %), latency and number of tool calls
  - a link to the raw trace JSON
- **Knowledge.** An agent picker, then that agent's goal, the facts it knows (with
  source, confidence and the beat it learned them), its secrets and attitudes, and the
  result of the latest leak check. In DM view, it also shows whether each fact is true
  or false, and the facts the agent does *not* know.

### DM view

A dev-only toggle that overlays ground truth: hidden entities on the map (dashed
gold outline, with a note such as "holds item:quill"), truth labels on facts, and
DM-only graph edges.

**The server sends ground-truth data only when started in dev mode
(`DUNGEON_DEV=1`).** Outside dev mode, nothing hidden ever reaches the browser, so it
can't be found through the browser's devtools either.

### Episode end

On `episode_ended`, the journal turns to an end-of-chapter page: who holds the quill
and how they got it, the number of beats, and a short recap from the story generator.
If a peer took the quill for their own agenda, that is called out as a hook for the
next episode. The composer is disabled. With dev tools on, there are buttons to replay
the session from the event log or start a new run from the seed.

### Assets

- **Kenney 1-Bit Pack** (CC0, 16×16), kept with its licence file in
  `content/assets/kenney-1-bit/`. Sprites are recoloured at build time, not in the
  original files: ink `#2b1d12` on parchment `#f6ecd6`, red ink `#9b1c1c` for warm
  accents and selection, and a small per-role ink tint for characters (player, peers,
  NPCs) so they can be told apart without full colour. Missing tavern pieces are drawn
  as new 16×16 tiles in the same 1-bit style and kept in `content/assets/dungeon-extra/`.
- The tavern is rebuilt in Tiled following the prototype's layout: bar with bottle
  shelves and strongbox, hearth, stage, common room with rug and tables, stairs,
  kitchen with a counter, barrels and the cellar trapdoor.
- `sprites.json` maps tags to frames, e.g. `{"barrel": "kenney-1-bit:204",
  "quill": "kenney-1-bit:633"}`, plus a fallback frame per entity kind.

### Accessibility basics

- Body text is dark ink on parchment, well above WCAG AA contrast.
- Keyboard:
  - **Tab** moves through cards and journal chips; **Enter** toggles selection.
  - **Esc** clears the selection; **↑** recalls the last intent.
  - **`** toggles Inspector mode.
  - Any key skips the ink-in reveal.
- Roll outcomes are written out ("success" / "failure"), never shown by colour alone.

---

## Section 5 — Errors, testing and observability



### Principles

- **Validate at every boundary, fail loud there.** Client messages, the seed file, tool
  inputs, generator output and every LLM response are parsed with zod where they enter
  the system. Inside the engine, inputs are trusted and invariants are asserted.
- **A beat either commits completely or not at all.** Nothing the player sees and
  nothing in the event log comes from a half-finished beat.
- **Every failure is explained.** Error messages name the value that was wrong and what
  was expected. Every failure lands in the beat trace with enough context to reproduce
  it.
- **Nothing waits forever.** Every network call has a timeout, and every retry loop has
  a limit.

### Failure catalogue

| Failure | Detected by | Handling | Player sees |
|---|---|---|---|
| Malformed client message | zod in `server.ts` | Rejected; no state change | `error` message (shown as a margin note) |
| Selection contains an unknown or invisible id | Intent validation | Intent rejected with `INVALID_SELECTION` and the bad id | Note; the chips stay so the selection can be fixed |
| Intent sent while a beat runs or after the episode ended | Beat state | Rejected (`BEAT_IN_PROGRESS` / `EPISODE_ENDED`) | Nothing (the composer is disabled anyway) |
| Tool input fails its schema | Tool registry | Returned to the DM as an `is_error` tool result; counts toward the cap | Nothing |
| Tool rejected by the engine (locked, unreachable, missing check receipt, illegal quill move) | Command handler | `is_error` result with the engine's message; the DM adapts | Only what the DM narrates |
| DM reaches the tool cap | DM loop | One extra narrate-only call | Nothing |
| DM finishes without a valid `narrate` | DM loop | One narrate-only retry, then the neutral summary | Neutral narration |
| Generator output invalid twice | Generator pipeline | `ok: false` back to the DM | Only what the DM narrates |
| Critic rejects twice | Critic | Neutral summary built from the events | Neutral narration (+ dev margin note) |
| Peer output invalid | Peer agent | Treated as `pass`; logged | Nothing |
| Anthropic API still failing after provider retries | `LlmProvider` | **Session pause** (see below) | Pause screen |
| Neo4j unreachable before commit (context queries) | `OntologyStore` | Beat rolled back; **session pause** | Pause screen |
| Neo4j unreachable after the log write (projection) | Projector | The beat stays committed (the log is canonical) and the player gets the result. The session pauses before the next beat, and on resume the projector catches up from the log | Result, then pause screen |
| Neo4j unreachable at startup | Server boot | Exit with an error naming the URI and how to start it (`docker compose up -d neo4j`) | — |
| Event log write fails | `eventLog.ts` | Beat rolled back; **session pause** with reason `internal_error` | Pause screen |
| Engine invariant violated (a bug) | Assertion in the engine | Beat rolled back; **session pause**; stack trace in the trace file | Pause screen |
| Beat takes longer than 120 s in total | `BeatRunner` | Treated as an API failure: rolled back and paused | Pause screen |
| Session budget reached | Cost meter | **Session pause** with reason `budget` | Budget prompt |
| WebSocket drops | Client and server heartbeat (15 s) | Client reconnects with backoff (1 s → 30 s); server keeps the session and resends `world_snapshot` plus journal entries since the last beat the client saw | "Reconnecting…" banner |

### Session pause

A paused session stops accepting intents until the cause clears.

```
running ──failure──▶ paused{reason, beat, attempt} ──cause cleared──▶ re-run beat ──▶ running
                              │
                              └── limit reached ──▶ waiting for the player: [Retry now] [Save and quit]
```

- **Reasons:** `llm_unavailable`, `graph_unavailable`, `internal_error`, `budget`.
- **Rollback first:** the engine restores its snapshot from the start of the beat. No
  events from the aborted attempt are written and no `beat_result` was sent, so the
  player never saw its rolls or narration.
- **Automatic retry** (for `llm_unavailable` and `graph_unavailable`): a health check
  runs after 5, 10, 20, 40 s and then every 60 s, **for at most 10 minutes**. When it
  passes, the beat is re-run from the start with the same intents (peer intents are
  regenerated). Dice for each attempt use a seed derived from
  `(sessionSeed, beat, attempt)`, so every attempt can be reproduced in tests.
- **After the limit**, or for `internal_error`, the pause screen offers *Retry now* or
  *Save and quit*. Nothing is lost, because committed beats are already in the log.
- **Budget pauses** ask whether to raise the cap (by the configured step) or stop.
- **Pause screen:** a parchment overlay with the reason in plain words, a countdown to
  the next retry, and (with dev tools on) the underlying error and a link to the trace.

### Timeouts and limits

| What | Limit |
|---|---|
| DM LLM call | 60 s |
| Peer, generator, critic, recap LLM calls | 20 s |
| Provider retries (429, 5xx, network) | 2, exponential backoff with jitter |
| Whole beat, wall clock | 120 s |
| Neo4j query / transaction | 5 s / 10 s |
| WebSocket heartbeat | 15 s |
| Automatic retry while paused | 10 min |
| Player intent text | 500 characters |

All limits live in one config module together with the per-beat limits from Section 3.

### Cost tracking

- A price table in config holds the per-million-token prices for each model tier
  (input, cache write, cache read, output). It is filled in from Anthropic's published
  pricing at implementation time and is easy to update.
- Every LLM call's cost is computed from its usage, including cache hits. It is shown
  per call and per beat in the trace and summed for the session.
- **Header meter** (dev tools on): session cost so far, e.g. `$1.84 / $5.00`.
- **Soft cap:** `SESSION_BUDGET_USD` (default 5). Reaching it pauses the session with
  reason `budget`; the player can raise the cap by `SESSION_BUDGET_STEP_USD`
  (default 5) or stop.
- **Evals** have their own cap per run, `EVAL_BUDGET_USD` (default 10). An eval run
  stops cleanly with a partial report when it reaches the cap.

### Test strategy

CI never calls the Anthropic API and needs no network. Real-model behaviour is covered
by [scenario evals](#scenario-evals) that run on demand.

**Determinism:** dice come from a seedable RNG, time comes from an injected `Clock`,
LLM calls go through `ScriptedProvider`, and the graph is `MemoryStore` (except in
integration tests). Tests don't depend on each other's order.

| Layer | Test type | What is covered |
|---|---|---|
| `shared` schemas | Unit | Valid and invalid samples for every schema, including realistic malformed LLM output (missing fields, extra prose around JSON, wrong enum values) |
| Engine commands | Unit | Every command: happy path, every rejection path (locked, unreachable, no check receipt, wrong actor, not enough gold, illegal `questCritical` move), resulting events |
| Engine rules | Unit | Dice and advantage with a seeded RNG, contested checks, combat turn order, the perception rule (rooms, private events, stealth wins, unconsciousness, darkness), the end condition (player holds, peer holds, quill in a container) |
| Projector | Unit | Each event type → graph mutation in `MemoryStore`; replaying a log gives the same graph as live play; `graph:verify` finds drift between the engine and the graph |
| `Neo4jStore` | Integration (`npm run test:integration`, Neo4j in Docker) | The same contract tests as `MemoryStore`, run against both implementations; constraints applied; context queries return the expected slices |
| DM loop | Unit (scripted LLM) | Tool results fed back, `is_error` on bad input, cap → narrate-only call, missing `narrate` → retry → neutral summary |
| Generators | Unit (scripted LLM) | Valid output registered in engine and graph; invalid → retry → `ok: false`; policy bounds enforced (rarity, value, stats) |
| Critic | Unit | Deterministic pre-check rules; verdict parsing; retry and fallback flow |
| Peers | Unit (scripted LLM) | Rotation priority; invalid output → pass; nudge after 3 passes |
| Knowledge | Unit | **Leak tests:** for every peer and NPC in the seed, the built prompt contains no fact id or statement the agent doesn't know |
| BeatRunner | End-to-end (scripted LLM, `MemoryStore`) | **Golden beats:** seed + scripted LLM responses + intent → the exact event list, journal entries and end state, saved as reviewed snapshots. Rollback on failure leaves no events behind |
| Client reducer | Unit | `applyServerMessage` for every message type; selection rules (toggle, max 6, Esc) |
| Client components | React Testing Library | Composer (submit, disabled during a beat, ↑ recall), journal reveal and skip, appendix tabs, Inspector toggle keeps state |
| Whole app | Playwright smoke test against the server in scripted mode | Load, click an entity on the canvas, submit an intent, see the journal entry, see the map marker |

Every bug fix comes with a test that fails before the fix and passes after it.

### Scenario evals

`npm run eval` (all scenarios) or `npm run eval -- --scenario steal-the-key`. It
runs against the real models and a fresh session from the Episode N seed. Each scenario
runs **3 times** by default (`--runs N`), because single runs of non-deterministic
models are noise. Reports show pass rates per check, not a single pass/fail.

**Scenario file** (`evals/scenarios/<name>.yaml`): a list of player intents (text plus
selected ids) to play in order, an optional beat limit, and the checks to apply.

**Checks after every beat (deterministic):**
- no knowledge leaks in any peer prompt
- `graph:verify` reports no drift between the engine and the graph
- the quill only moved through a legal `transfer_item`
- every narrated outcome has a matching check event
- no tool error rate above the scenario's threshold

**Checks per scenario:** e.g. "the quill is obtained within 30 beats", "no item is
created without a generator call", "Brann never states the quill's location".

**Initial scenarios (about 17):**

| Scenario | What it tests |
|---|---|
| `talk-route` | Talking alone can lead to the quill |
| `steal-the-key` | Stealth, check receipts, `steal` |
| `buy-the-key` | Gold, a willing seller, attitude |
| `bar-brawl` | Combat mode, damage, unconsciousness, `end_combat` |
| `lie-to-brann` | Contested Deception vs Insight |
| `ask-peers-for-help` | Peer intents, rotation, private actions |
| `peer-grabs-quill` | The end condition fires when a peer holds the quill; the hook is recorded |
| `open-everything` | Generator limits, item quality, no duplicate names |
| `cheat-success` | "I succeed at picking the lock": the DM must still roll |
| `assert-outcome` | "Brann doesn't notice me take the key": treated as an attempt with a check |
| `rewrite-history` | The player insists on things that never happened ("you already gave me the key"); established facts must hold |
| `conjure-quill` | "I find the quill in my pocket": the engine must refuse |
| `probe-npc-knowledge` | Ask Wren about the cellar: no NPC knowledge leak |
| `probe-peer-secret` | Ask Ilsa about her debt: she can lie or deflect, but never reveals the secret by accident |
| `nonsense-input` | Gibberish and off-topic input are handled gracefully |
| `player-down` | The player at 0 HP: play continues, the narration stays consistent |
| `long-session` | 40 beats: recap updates, context budget, cost and latency stay stable |

**Report:** `data/evals/<timestamp>/report.md` plus `report.json` with pass/fail per
check, and metrics:
- tool error rate, parameter-validation failure rate, generator `ok: false` rate
- tool calls per beat compared with the cap
- critic rejection and fallback rates, unspent-receipt count
- leak count (NPC, peer, embellishment)
- DC distribution (how generous the DM is)
- fact spread: `KNOWS` edges per fact over the session
- generated-content repetition (tag frequency) and sprite fallback rate
- beats to the quill
- tokens, cache hit % (DM prefix misses called out), cost
- p50/p95 beat latency and time to first feedback

**Critic calibration.** A small set of beats with human labels ("this narration
contradicts the state" / "this is fine") is kept in `evals/critic-labels/`. Each eval
run reports the critic's precision and recall on it, because LLM judges are much less
reliable on single items than on aggregates. Any judge of narrative *quality* is used
only to compare versions across many beats, never as a gate on a single beat.

**Tool-selection regression cases.** `evals/tool-selection/` holds small cases (state +
intent → expected tool calls), built from recorded traces. They run against the real
DM in evals, and their recorded transcripts run through `ScriptedProvider` in CI, so
tool-description changes that break tool choice show up quickly.

When there's a previous report, it shows the difference, so prompt or model changes can
be compared.

### Observability

- **Beat trace** (`data/sessions/<sessionId>/traces/beat-<n>.json`), one per beat
  attempt:
  - the intents
  - each peer call
  - each DM loop step (request, `tool_use`, `tool_result`)
  - generator calls
  - the critic verdict
  - timings, tokens, cost
  - the outcome: `committed`, `fallback`, `aborted`
  - the prompt version used for each role

  Full prompts and responses are stored here and nowhere else. The folder is local and
  gitignored.
- **Prompt versions:** each role's prompt lives in its own file with a version id in its
  header. Traces and eval reports record the version, so results are always tied to the
  exact prompt.
- **Server logs:** structured JSON (pino) to stdout and `data/sessions/<id>/server.log`,
  with one line per beat (outcome, latency, cost) and every warning and error. The API key
  and full prompts are never logged.
- **Session summary:** written at episode end (or quit) to
  `data/sessions/<id>/summary.json`:
  - beats played, who got the quill
  - cost, tool error rate, critic stats
  - leak count (expected to be 0)

### Replay

State replay only: rebuild what happened and step through it. No LLM calls.

- **Start:** `npm run replay -- <sessionId>`, or *Replay session* on the end-of-chapter
  page (dev tools on).
- **What happens:** the server reads the event log, rebuilds engine state, wipes and
  re-projects Neo4j for that session, and opens a **read-only** session. The composer is
  disabled.
- **UI:** a beat timeline appears above the journal (slider plus previous/next). The
  journal, map, companions, satchel and appendix views all show the world as it was at
  the chosen beat. DM view works as usual in dev mode.
- **Speed:** the server keeps an in-memory engine snapshot every 10 beats, so jumping
  to any beat replays at most 9 beats of events.
- **Compatibility:** log records carry a schema version `v`. Replay refuses a log with
  an unknown major version and says which version it found and which it supports.

### Developer commands

| Command | Does |
|---|---|
| `docker compose up -d neo4j` | Start Neo4j (Browser on `localhost:7474`) |
| `npm run dev` | Server + client with hot reload (`DUNGEON_DEV=1`) |
| `npm test` | Unit and end-to-end tests with scripted LLM and `MemoryStore` |
| `npm run test:integration` | `Neo4jStore` contract tests against Docker Neo4j |
| `npm run test:e2e` | Playwright smoke test |
| `npm run eval` | Scenario evals against the real models |
| `npm run replay -- <id>` | State replay of a session |
| `npm run graph:rebuild -- <id>` | Wipe Neo4j and re-project a session's log |
| `npm run graph:verify` | Compare engine state with the graph |
| `npm run lint` / `npm run typecheck` | ESLint + Prettier check / `tsc --noEmit` across workspaces |

`.env.example` lists every variable: `ANTHROPIC_API_KEY`, `NEO4J_URI`, `NEO4J_USER`,
`NEO4J_PASSWORD`, `DUNGEON_DEV`, `SESSION_BUDGET_USD`, `SESSION_BUDGET_STEP_USD`,
`EVAL_BUDGET_USD`. Secrets are never committed.

---

## Acceptance criteria for Episode N

Episode N is done when all of these hold:

1. A full playthrough from the seed to the quill works in the Codex UI, with the real
   models, through at least two different routes (e.g. talking and sneaking).
2. Every scenario eval passes its deterministic checks, with zero knowledge leaks and
   zero engine/graph drift.
3. `npm test`, `npm run test:integration`, `npm run test:e2e`, lint and typecheck all pass.
4. The graph visibly grows during play (generated items, NPCs, facts, attitudes) and can
   be inspected in the appendix and in Neo4j Browser.
5. Any session can be replayed beat by beat from its event log.
6. Median beat latency is under 15 s, median time to first feedback is under 4 s, and
   median session cost is under the default budget, as measured by the `long-session`
   eval.

## Next steps

1. Review of this spec.
2. A step-by-step implementation plan, built from this spec.
3. Implementation, delegated in slices to `/astra-worker`, each slice verified by its
   tests before the next starts. The existing C++/SDL codebase is deleted at the start.
