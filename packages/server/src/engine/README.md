# Engine rules and interpretations

The public API is `index.ts`. Construct `new Engine(seed, grid, sessionSeed)`
with an already parsed `EpisodeSeed`, call `beginBeat(beat, attempt)`, then call
the methods named after the engine tools. Inputs use the shared types and are
expected to have passed the shared input schemas. State-dependent failures return
`{ ok: false, error: { code, message } }` without changing any state, receipt,
buffered event or RNG position. Invalid construction or beat coordinates throw
`EngineError` before mutation.

`state`, `snapshot()`, command results and `collectEvents()` return detached
copies. `successfulReceipts()` returns this beat's successful, unspent receipts.
Commands execute on a private working copy and publish it only after validation,
including the central quest-item invariant. `rollback()` restores the snapshot
taken immediately after `beginBeat` sets the beat, attempt and RNG. Roll back an
aborted attempt before beginning its retry. Starting the next beat keeps the
current hard state. Older receipts remain queryable in state but are invalid for
new actions; a new attempt of the same beat replaces that beat's receipts.

`combat` is `null`. Direct engine calls have no per-beat call limit.

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
  one-tile path. Every other character, including an unconscious one, blocks
  movement. Furniture collision comes from the grid. Doors are independent
  `{tile, locked}` obstacles, with no container coupling or door-opening command.
- Entity destinations use an orthogonally adjacent free tile. Items inherit
  their character/container holder's tile; a floor item uses its location's first
  walkable tile in row-major order because items have no tile field. Movement
  chooses the most specific containing location: spot, room, then building,
  followed by smallest bounds and lexical ID. Interactions require the same room,
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
  it does not trigger an attack, initiative or turn resolution.
- One transaction-boundary guard prevents quest-item creation, deletion,
  critical-flag changes and holder changes except actor-driven `transfer_item`.
  Ordinary movement carries inventory without changing its canonical holder;
  discovery and equipment may change without moving that holder. The end
  condition depends only on a quest item's player/peer holder, regardless of
  hidden state or consciousness.
- Construction checks seed references, HP/maxHP/consciousness consistency and
  rectangular grid dimensions. It does not validate full map geometry or reject
  location parent cycles.
