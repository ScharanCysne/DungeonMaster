# Shared schema decisions

The specification is the source of truth. These notes record choices where it gives
examples or prose instead of a complete wire format.

## Organization and validation

- All public schemas and inferred types are exported from `src/index.ts`. Large
  areas are split into supporting modules and `tools/`; tests and small fixture
  helpers are separate. `PROTOCOL_VERSION` remains 1.
- Objects are strict, including nested LLM inputs. No number or boolean coercion is
  performed. Optional fields can be omitted, but do not accept JSON `null` unless
  explicitly nullable below. Display names and identifiers must be nonempty;
  descriptive strings may be empty unless their schema requires content.
- Beats and sequences are nonnegative integers; combat rounds begin at 1 and turn
  indexes at 0. Coordinates are integers and may be negative; rectangle dimensions
  are positive. Ordinary HP, AC, gold, weight and value cannot be negative; max HP
  is positive. Relationships between values, such as HP versus max HP or a path's
  endpoint, remain engine checks.
- The fixed DC scale applies to ordinary item/container discovery and lock DCs as
  well as skill checks. A roll's `dc` is any integer because it also represents AC
  and opposed totals. Roll outcomes are `success | failure | tie`; attack criticals
  have a separate boolean. Die results are positive integers; fixed unarmed damage
  uses an empty `rolls` array and a constant expression (e.g. `1+5`). Totals may be
  negative and precede damage clamping. Dice expressions remain strings for the engine
  parser; the schemas do not implement dice syntax or arithmetic.
- Proficiencies use the 18 standard 5e skill names in snake_case. Ability modifiers
  and the Episode N +2 proficiency bonus are engine rules, not additional Character
  properties or calculations in shared schemas.

## IDs, nodes and edges

- Slugs use lowercase ASCII letters, digits and single hyphen separators.
  `slugify` normalizes Unicode accents, replaces punctuation/whitespace with hyphens,
  trims separators and falls back to `unnamed` when no slug characters remain.
  `uniqueId` chooses the first available suffix starting at 2, scoped to the label.
- `uniqueId` accepts the seven name-based labels. Events instead have coordinate
  IDs, `event:<beat>-<seq>`, with nonnegative decimal integers and no leading zeroes.
  Allowing event display names through `uniqueId` would violate the required event
  format. All eight ID schemas retain template-literal TypeScript types.
- Node schemas follow the property tables without adding a label discriminator.
  Their ID prefixes distinguish the union. Character position is represented by
  seed placement, movement events and snapshot positions, since it is absent from
  the Character property table.
- Edges use `{type, from, to, properties, createdBy, createdAtBeat}`. Endpoint labels
  follow the table. Propertyless edges have an explicit empty `properties` object.
  Attitude values/deltas are integers; confidence is fractional.
- `SUPERSEDES` points from the correcting Fact to the older Fact and has empty
  properties. `KNOWS.retractedAtBeat?` is a nonnegative integer. Learning a
  superseding fact retracts the learner's older knowledge during projection;
  `FactLearned` still records the new learning, without a retraction payload.
- Fact truth is boolean `true`/`false` or the string `'unknown'`, following the
  example seed's JSON boolean rather than interpreting all table values as strings.

## Events and tool results

The event catalogue defines effects, but only `ContainerOpened` has an explicit
payload example. `event-payloads.ts` makes the other payloads concrete:

| Events                                  | Payload decision                                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SeedLoaded`                            | The full seed plus `rngSeed`, so replay has its starting state.                                                                                                                                      |
| `BeatStarted`, `BeatCommitted`          | Attempt number; empty marker payload, respectively. Beat/sequence are in the envelope.                                                                                                               |
| `IntentReceived`                        | Selection, text and optional peer speech. Private/actor live in the envelope. Player-only text/selection limits do not constrain peer log records.                                                   |
| `EntityMoved`                           | Entity ID, from/to location IDs, destination tile and a nonempty tile path.                                                                                                                          |
| `ItemTransferred`                       | Item ID, typed old/new holders, reason and resulting gold balances (`goldChanges`, empty for ordinary transfers).                                                                                    |
| `ItemEquipped`, `ItemUnequipped`        | Character ID, item ID and slot.                                                                                                                                                                      |
| `ContainerOpened`, `ContainerUnlocked`  | Container ID and revealed item IDs; unlock also records its method. This follows the catalogue's statement that unlocking can reveal contents.                                                       |
| `EntityRevealed`, `EntityHidden`        | Affected entity ID.                                                                                                                                                                                  |
| `CheckRolled`                           | A nested `kind` union for a single skill/ability check versus an opposed check, preserving reasons, receipts and all roll details. Opposed checks store both rolls; `winner: null` represents a tie. |
| `AttackResolved`                        | Attacker, target, optional weapon, roll, hit and critical flags. Damage has its own event.                                                                                                           |
| `DamageApplied`, `Healed`               | Target, amount, resulting HP/consciousness, roll and cause/source.                                                                                                                                   |
| `CombatStarted`, `CombatEnded`          | Initiative rolls/order, turn and round; ending reason, respectively.                                                                                                                                 |
| `EntityCreated`                         | Complete node and edges, plus optional location/tile position for engine registration.                                                                                                               |
| `FactCreated`, `FactLearned`            | Fact with ABOUT/ORIGIN_OF targets; learner/fact IDs and KNOWS learning fields (`since`, `source`, `confidence`), respectively.                                                                       |
| `AttitudeChanged`, `QuestStatusChanged` | Resulting attitude plus delta/reason; quest ID and new status, respectively.                                                                                                                         |
| `NarrationCommitted`, `CriticRejected`  | Resolved narration; rejected reference-form narration and a nonempty issue list, respectively.                                                                                                       |
| `RecapUpdated`                          | Recap text, as required by §3 despite omission from the §2 catalogue.                                                                                                                                |
| `EpisodeEnded`                          | Character holding the quill, episode quest ID and summary.                                                                                                                                           |

- Every log record requires all envelope fields and `v: 1`. System events use an
  explicit `actor: null`; character actions use a CharacterId. Trace/session/check
  IDs are nonempty opaque strings because no format is specified. The schema also
  covers `CriticRejected`, whose later consumer must keep it trace-only as specified.
- Tool return values are unspecified except for check receipts. Engine and
  soft-state result values generally reuse their event payloads. Search returns
  revealed IDs; skill checks return receipt/total/outcome/roll; opposed checks
  return receipt/winner/both rolls; sharing returns learned records; fact creation
  returns the assigned fact ID; narrate returns its narration. All are wrapped by
  the schema factory for the specified generic `ToolResult<T>` union.
- `TurnAdvanced` carries `{combatant: CharacterId, round, turn}` with a positive
  round and nonnegative turn index. Together with `CombatStarted`, `EntityMoved`
  and `CombatEnded`, it preserves turn and movement usage for replay. `pass_turn`
  accepts only `{actor: CharacterId}` and returns the `TurnAdvanced` payload.
  A first attack refused its turn still leaves `CombatStarted` available through
  event collection; the unchanged failed `ToolResult` branch contains only error.
- `skill_check` requires exactly one of skill/ability. Unlocking requires `itemId`
  for a key and `checkId` for lockpick/force. Stealing requires `checkId`; buying
  requires a nonnegative integer `price`, consistent with integer gold balances.
  Receipt validity and state-dependent permissions remain handler work.
- `create_fact.knownBy` contains character IDs; seed `knownBy` additionally carries
  confidence. Generator NPC `hints.role` is free-form social role text (e.g.
  merchant), while generated Character.role is always `npc`. `attitudeToParty` is
  an attitude number. These nested input shapes were not fully specified.
- `create_fact.supersedes?` is a FactId. Kinds remain `rumour | observation | lore`;
  entity existence and the ban on `questCritical` subjects are handler checks.
- `voice_npc` takes a CharacterId and a nonempty direction of at most 40
  whitespace-separated words, counted like narration. It returns nonempty
  `{lineId, text}` strings. NPC role, knowledge isolation and per-beat line identity
  are runtime checks.
- `narrationSchema` is the DM submission: each strict dialogue object is an NPC
  `{lineId}` reference or a peer `{speaker: CharacterId, text}`. `narrate` input and
  output, and `CriticRejected` in traces, preserve this form. The separate
  `resolvedNarrationSchema` carries `{speaker: CharacterId, text, lineId?}` for
  `NarrationCommitted`, `beat_result` and `world_snapshot.recentNarration`, so replay
  and clients have the actual words without looking up transient voice results.
  Dialogue text and line IDs are nonempty; dialogue has no `private` field.
  Resolving NPC references and matching peer speech remain runtime checks.
- Narration's 180-word ceiling counts nonempty whitespace-separated words in
  `text` only; dialogue lines have no specified word cap. No schema attempts to
  verify second-person prose. Critic rejection requires at least one issue and
  accepts `temporal_contradiction` for inconsistent event ordering.

## Generators

- Raw model response schemas (`generated*`) are distinct from registered tool
  result schemas (`generate*Output`). Registration assigns IDs/provenance, adds
  relationships and applies config policy before producing ordinary ontology nodes.
- Raw generated items contain content and 1–2 backstory facts; NPCs contain content,
  one secret fact, initial attitudes and optional starting items (using the same
  item response schema); features are unopened containers with no contents field;
  stories contain 1–3 lore/backstory/rumour facts. Raw facts have statement, truth,
  kind and ABOUT references; registration attaches self-origin references.
- Raw numeric values have only structural number/integer constraints. They can
  exceed NPC, value, attitude or DC policy bounds; later validation must check
  config and ontology invariants. Raw item rarity accepts every known rarity.
  Generated items cannot supply `questCritical`, IDs or provenance. The later
  registrar must set `questCritical: false` and assign position where needed.
- Registered outputs contain full nodes/facts and, for NPC attitudes, full edges;
  NPC starting items include their backstories. They obey ontology constraints,
  but do not embed the tighter generator policy ranges (6–18 abilities, etc.).

## Seed

- The root requires `episodeId`, `mapId` and arrays for all seven entity collections
  plus attitudes and secrets. No real Episode N content is authored here.
- Provenance is absent from seed records, as in the example; the loader supplies
  `seed` and beat 0. Other common metadata is required except on facts, whose name
  and summary are optional and tags default to `[]` to accept the example fragment.
- Locations use optional `partOf`; characters/containers use `location`; items use
  the specified tagged holder. Personal quests require a single `pursuedBy` character;
  faction members use `{character, rank?}`; secrets use `{character, fact}`; initial
  attitudes use `{from, to, value, reason}`.
- Defaults for omitted seed fields are: locations lit, characters conscious and
  not hidden, containers unopened, quests active. Other mechanical fields remain
  explicit, including max HP, gold and hidden/discovery state where specified.
- `validateSeedReferences` returns all unknown references and duplicate IDs, plus
  exactly-one-player and exactly-one-questCritical-item problems naming the values.
  It is separate from parsing and does not mutate the seed. Map geometry, parent
  cycles, secret truth/kind consistency and actual quest solvability are later
  semantic/content validation, outside these schemas.

## Protocol and debug

- Message fields are flat next to `type`. Snapshot fields are `beat`, `mapId`,
  `entities`, separate `positions`, party/inventory IDs, gold and recent narration.
  The separate positions avoid inventing graph node properties. Narration payloads
  use resolved dialogue. An optional `groundTruth` graph on beat results
  represents the dev overlay; visibility/dev authorization belongs to the server.
- `beat_progress` carries `beat` and a strict `progress` union: a `peer_line` has a
  CharacterId `speaker` and nonempty `text`; a `map_cue` has a CharacterId `entity`,
  a `look_at | turn | glance_up` cue and optional EntityId `target`. These are
  provisional feedback only; rolls, movement and narration are excluded.
- `hello.lastSeenBeat?` supports §5 reconnect recovery, though absent from the §1
  table. `debug_request.target` remains an opaque string because trace targets need
  not be entity IDs. `debug_response` discriminates on `kind` as well as the outer
  message type, with typed trace, knowledge-slice and graph data.
- Debug graph/knowledge fields follow §2 context-query results. Trace metadata,
  calls, intents, peer turns, events, critic verdict, timings, cost and token usage
  are typed. Provider-specific full request/response blobs use recursive `z.json()`;
  `LlmMessage`/`LlmResponse` wire types belong to the LLM provider. No `any`/unvalidated `unknown` payload substitutes are used.
- Added `paused` with reason, beat, attempt and `retryInMs`, and `resumed` with beat,
  as requested from §5. `retryInMs: null` means no automatic retry is scheduled.
  The client answers a pause with `session_command` (`retry_now`, `save_and_quit`,
  `raise_budget`).

## Config and remaining spec gaps

- Durations are milliseconds, prices are USD per million tokens, budgets are USD,
  item value is gp. Nested config objects support partial overrides and defaults.
  Fixed input ceilings (500 characters, 6 selected entities, 30 attitude delta)
  permit stricter configuration, not values exceeding the requested input schemas.
- The `npc_voice` model role defaults to `claude-haiku-5-5` and is valid in traces.
  `voiceNpcPerBeat` defaults to 4; `retryToolCallsForUnbackedOutcome` defaults to 2.
  Both accept nonnegative integer overrides, including zero. Handlers exclude
  voice calls from the ordinary tool cap and allow retry tool calls only for
  `unbacked_outcome`; other critic retries remain narration-only.
- Added configurable NPC stat policy defaults from the generator pipeline. The
  price-table schema defaults to an empty table until real prices are filled in.
  Consumers must distinguish missing prices from zero cost.
