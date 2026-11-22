# Engine rules and interpretations

The public API is `index.ts`. Construct `new Engine(seed, grid, sessionSeed)`
with an already parsed `EpisodeSeed`, call `beginBeat(beat, attempt)`, then call
the methods named after the engine tools. Inputs use the shared types and are
expected to have passed the shared input schemas. State-dependent failures return
`{ ok: false, error: { code, message } }` without changing any state, receipt,
buffered event or RNG position, except that an initiating attack can start combat
before being refused its turn (see Combat). Invalid construction or beat coordinates throw
`EngineError` before mutation.

`state`, `snapshot()`, command results and `collectEvents()` return detached
copies. `restore(snapshot)` installs a detached snapshot and resets the rollback
baseline; the beat runner uses it to publish an isolated, committed attempt.
`successfulReceipts()` returns this beat's successful, unspent receipts.
Commands execute on a private working copy and publish it only after validation,
including the central quest-item invariant. `rollback()` restores the snapshot
taken immediately after `beginBeat` sets the beat, attempt and RNG. Roll back an
aborted attempt before beginning its retry. Starting the next beat keeps the
current hard state. Older receipts remain queryable in state but are invalid for
new actions; a new attempt of the same beat replaces that beat's receipts.

`combat` is `null` outside combat. Direct engine calls have no per-beat call limit.

## Events and perception

Commands return `ToolResult<T, EventDraft>`. Event drafts use shared payloads
and contain `type`, `payload`, `actor`, `private`, and `witnesses`.

Each pending event stores its witness candidates from the emitting command's
post-command state: conscious characters in the event's room, restricted to the
actor and explicit targets for private events. In an unlit room, candidates must
have the `darkvision` tag or be directly involved. The event room is retained
when emitted; movement events occur in the destination room. Later movement,
damage or healing cannot change an earlier event's candidates. Snapshots include
these candidates, and rollback restores them with the buffered events.

`collectEvents()` removes candidates beaten by the event's actor in a contested
Stealth or Sleight of Hand check anywhere in the current beat, including contests
rolled after the event. Either participant's winning skill can cause this
exclusion, even for an explicit target. Spent successful contests still count;
contests from previous beats do not. Command results apply contests known at the
time and are provisional until collection.

Explicit targets are directly affected characters: contest opponents, transfer
endpoints, damage or healing targets, and unequipped owners. Private events and
direct targets still obey the room, consciousness and contest restrictions.

## Command rules

- Internal `createEntities` is not a DM tool. A whole batch uses one transaction,
  so an NPC and its inventory either all exist or none do. Existing IDs and missing
  holders are rejected; the quest-item guard still applies. Items retain their
  requested holder, even a closed container. NPCs/containers use the nearest free
  walkable tile within their exact location, by Manhattan distance from the
  location's top-left or the feature's preferred tile, with row/column ties.
  Characters, containers and door tiles are occupied. Containers start empty and
  closed. Initial NPC attitude edges accompany creation. The command uses the same
  registrar as replay, and records chosen positions and generator provenance in
  EntityCreated drafts; usual command-time perception applies.

- The PRNG is FNV-1a over UTF-16 seed code units followed by mulberry32. Beat seeds
  hash `JSON.stringify([sessionSeed, beat, attempt])`. RNG position is the mutable
  32-bit generator state. Dice accept lowercase, whitespace-free `NdM[+K|-K]`
  expressions with safe integer arithmetic. Non-check rolls have outcome
  `success` and no DC. Checks use the supplied advantage setting; its event field
  explains keeping one of the two recorded dice. No natural-1/20 special rule
  applies to checks. Equal opposed totals give both rolls `tie`, winner `null`,
  and an unusable receipt. A contest issues one receipt for its initiating actor;
  either participant's winning Stealth/Sleight of Hand can affect perception.
- Grid rows are indexed `[y][x]`; tile bounds are half-open. A* uses orthogonal
  unit steps, includes the starting tile, and chooses the nearest reachable free
  tile by path length. A character already at a valid destination returns a
  one-tile path. Other characters, including unconscious ones, allow passage but cannot
  share a destination tile. Stable A* insertion order breaks equal-length ties
  (east, south, west, north). Furniture collision comes from the grid. Doors are independent
  `{tile, locked}` obstacles, with no container coupling or door-opening command.
- Entity destinations prefer the shortest path to an orthogonally adjacent free
  tile inside the entity’s room. If none is reachable, they use the shortest
  path to any free walkable tile in that room. Items inherit
  their character/container holder's tile; a floor item uses its location's first
  walkable tile in row-major order because items have no tile field. Movement
  chooses the most specific containing location: spot, room, then building,
  followed by smallest bounds and lexical ID. Room destinations exclude tiles
  belonging to overlapping sibling rooms, so leaving the bar for the common room
  actually crosses its boundary. Interactions require the same room,
  without extra tile adjacency. Parent chains resolve spots to rooms; a spot
  without a room parent can use its smallest geometrically containing room.
  Room lighting governs its spots. Move accepts any known positioned entity,
  regardless of visibility to the actor.
- No key field exists in the seed. An item property
  `key_for:container:<slug>` binds that item to a container. Construction derives
  `EngineContainer.keyIds` from those properties. Keys are reusable and must be
  carried by the unlocking actor. Lockpick/force require an explicit `lockDc`;
  missing DCs are rejected rather than silently given a default.
- Search requires the actor's room and the requested area's bounds. It discovers
  hidden containers and floor items, plus items in visible, unlocked, open
  containers. It does not search carried items or through closed containers.
  Hidden entities without `findDc` remain hidden. Open and unlock reveal all
  hidden contents regardless of discovery DC. Unlock preserves `opened`; a
  closed container must still be opened before transferring its contents.
  Opening an already open container succeeds with no newly revealed items;
  unlocking an already unlocked container is rejected.
- `pick_up` takes floor/open-container items into the actor's inventory; `give`
  sends the actor's carried item to another character; `drop` sends it to a floor
  location or open container. `steal`, `buy`, and `loot` take another present
  character's item into the actor's inventory. Hidden items are inaccessible
  unless already carried by the actor. Transfers to the same holder are rejected.
  An unconscious recipient may receive a gift. No combat state is needed for loot.
- Seller consent has no dedicated schema field. A conscious seller is treated as
  willing unless tagged `unwilling_to_sell`; a buy call represents the negotiated
  price. Prices may be zero or the buyer's full gold balance. Gold changes record
  resulting balances, and unsafe integer overflow is rejected.
- Equipment has no item/slot compatibility metadata. Any carried item can occupy
  one empty slot; occupied slots and equipping the same item twice are rejected.
  Transfer or consumption automatically clears equipment and emits
  `ItemUnequipped`, attributed to the acting character, before the main event.
- Receipt healing uses its receipt's conscious actor as healer, requires that
  healer in the target's room, and spends Medicine or Religion. Item healing
  requires a consumable carried by someone present; the carrier need not be
  conscious under that literal prerequisite. Consumption deletes the item and
  clears its inventory/equipment records; `Healed.source` identifies the consumed
  item. Rest needs no receipt or conscious actor. Positive healing from
  zero restores consciousness. Negative damage/healing rolls have zero effect;
  healing amount is actual HP regained, damage amount is the nonnegative rolled
  amount even when remaining HP is lower.
- `apply_damage` is a system/environmental action with `actor: null`. Its shared
  input has only target, dice and free-text cause. The cause is descriptive;
  it does not trigger an attack or initiative. Knocking out the current combatant
  advances their turn when another participant is eligible.
- One transaction-boundary guard prevents quest-item creation, deletion,
  critical-flag changes and holder changes except actor-driven `transfer_item`.
  Ordinary movement carries inventory without changing its canonical holder;
  discovery and equipment may change without moving that holder. The end
  condition depends only on a quest item's player/peer holder, regardless of
  hidden state or consciousness.
- Construction checks seed references, HP/maxHP/consciousness consistency and
  rectangular grid dimensions. It does not validate full map geometry or reject
  location parent cycles.

## Combat

- An attack requires a conscious attacker and a character target in the same
  room. Unconscious targets are allowed. Actor, target, weapon ownership, dice
  syntax and safe damage arithmetic (including criticals) are checked before starting combat. Every conscious character in the
  attacker's room participates, including hidden characters. Initiative records
  d20 + DEX modifier for each participant, sorted by total descending, then DEX
  score descending, then character ID ascending. Round 1 starts at index 0.
- The first valid attack starts combat even if its attacker loses initiative.
  In that case it returns `NOT_YOUR_TURN`; no attack roll occurs, but initiative,
  RNG consumption and `CombatStarted` persist in state and `collectEvents()`.
  If the attacker wins initiative, the successful result includes both the start
  and attack events. Subsequent rejected commands preserve the entire snapshot.
- While combat is active, only the current combatant may move, attack, initiate
  checks or contests, search, open/unlock containers, transfer, equip/unequip,
  hide, or heal using a check receipt. Receipt healing uses the receipt's actor.
  Contest targets need not have the turn. A check consumes an action even if its
  roll fails or ties; spending its receipt requires a later turn in the same beat.
  Item/rest healing and environmental damage do not consume actions.
- Each turn permits one `move`, including a move that stays on the same tile,
  and one action. `MOVE_ALREADY_USED` rejects a second move. A successful action
  immediately ends the turn; `pass_turn {actor}` ends it without an action.
  Other actors receive `NOT_YOUR_TURN`. Movement is optional and must precede an
  action. Rejected commands consume neither movement nor actions.
- The combat room and initiative order remain fixed. Advancement skips
  unconscious characters and those outside that room. Leaving the room ends the
  fleeing character's turn immediately; environmental knockout does likewise.
  Passing the end of the order increments the round, including when the only
  eligible combatant receives another turn. Healing makes an original participant
  eligible again. With nobody eligible, combat retains its cursor and movement
  usage until healing permits advancement or combat is explicitly ended.
- `CombatStarted` records order, round and turn. Every advancement emits
  `TurnAdvanced {combatant, round, turn}`, including a new round with the same
  combatant, and resets movement usage. `combat.roomId` comes from the instigator's
  room at `CombatStarted`; `combat.moved` is set by the current actor's
  `EntityMoved` and cleared by `TurnAdvanced`. These fields survive beat changes
  and can be reconstructed from events and prior character positions.
- An explicit weapon must be carried and have valid damage dice. Otherwise a
  damaging main-hand item is used; otherwise the attack is unarmed. Item kind is
  immaterial. The `ranged` tag uses DEX; otherwise `finesse` uses the higher of
  STR and DEX; otherwise STR applies. All attacks add +2 proficiency regardless
  of skill proficiencies. To-hit is d20 + ability modifier + 2 against AC.
  Natural 20 always hits critically; natural 1 always misses.
- A hit deals weapon dice plus the selected ability modifier, with minimum 1
  damage. Criticals roll every weapon die twice, adding the expression's fixed
  modifier and ability modifier once each. Unarmed damage is 1 + STR modifier,
  minimum 1, with no damage RNG and no critical doubling. Its roll records a
  constant expression and an empty dice array. Damage roll totals retain their
  arithmetic value before the minimum is applied to `amount`.
- `AttackResolved` records the to-hit roll, hit and critical flags, and the weapon
  actually used. Hits additionally emit `DamageApplied`, attributed to the
  attacker. Zero HP makes the target unconscious. All combat events use the same
  command-time witness capture, darkness, privacy and contested-stealth rules as
  other events; unconscious characters cannot witness subsequent commands.
- Loot is an ordinary `transfer_item` action with reason `loot`; the holder must
  be unconscious. Combat never ends automatically. `end_combat {reason}` requires
  active combat, emits `CombatEnded` in its original room and clears combat state.

## Replay

`Engine.fromLog(records, grid)` rebuilds state from committed records returned by
`readEventLog`. The first record must be `SeedLoaded`; its full seed and `rngSeed`
initialize the engine. The grid remains an explicit input. `reduceEvent` is also
exported as a pure, detached state reducer. Replay applies recorded outcomes and
stored positions without rolling dice or recomputing perception.

Transfers restore holders, inventory, container contents and resulting gold;
healing from an item removes that consumed item and its equipment. Container
reveals restore item visibility. Combat reconstructs its room from the initiating
actor, movement usage from `EntityMoved`, and its cursor from `TurnAdvanced`.
`EntityCreated` registers characters (requiring position), containers (position
or `LOCATED_IN`), items (holder edges or floor position), and locations (`PART_OF`).
Generated keys use the same `key_for:` convention as the seed. Soft entities and
other event types leave hard state unchanged; every subsequent record advances
`state.beat`. Quest statuses remain in the graph because EngineState has no quests.

Receipts, receipt counters, attempt and RNG position are transient and are not
replayed. Call `beginBeat(nextBeat, attempt)` before resuming commands; it reseeds
from the session seed, beat and attempt. Replayed engines have no pending drafts
and use the reconstructed state as their initial rollback baseline.
