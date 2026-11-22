# The Crooked Lantern

Rain has driven Kael Varn and three uneasy companions into Odo's former tavern.
The Inkless Quill waits inside a locked, concealed barrel by the kitchen hatch.
The episode ends when Kael or a peer carries it.

`seed.json` contains 8 locations, 9 characters, 6 containers, 19 items, 20 facts,
4 quests and 3 factions. The mandatory gear occupies 16 item records; the stranger's
dagger and signet and Wren's lute complete the cast. `sprites.json` supplies tag
mappings, kind fallbacks and explicit overrides for every character, container
and item. Use an override first, then the first matching tag in entity order,
then the item-kind fallback or `npc`/`container` fallback.

Generated entities persist their chosen sprite. Their prompts include catalogue
tags; objects require a closest-category tag before descriptive motifs. Generic
`item`/`tool` fallbacks and the `tools` tag use treasure frame 237 as a neutral
object because the former 571 frame depicts a key. Explicit seeded gear overrides
remain authoritative. Document fallback stays 290; container fallback stays 302.
Generated NPCs prefer role tags; unmatched roles and generic `human` use a stable
ID hash over frames 25, 26, 76, 78, 79, 80, 126, 127, 173, 174, 175, 176. None
overlap the seeded character overrides (74, 124, 77, 128, 172, 319, 470, 75, 222).

## Finding the quill

- Search the common room (Investigation or Perception DC 10), open the loose
  floorboard and take the letter. Its ABOUT fact names the old barrel by the hatch.
- Brann, Marta and Tobb offer independent leads. Brann's ledger and the hearth
  recess provide corroboration. The stranger knows Odo hid the quill here; Wren's
  claim that the stranger is Odo is false.
- Enter the bar to bargain for, receive or steal Brann's iron key. A successful
  Sleight of Hand receipt authorizes theft. Defeating Brann also permits looting
  the key; the fight leaves him unconscious rather than dead.
- Enter the kitchen and search (DC 15) to reveal the old barrel. Unlock it with
  Brann's key, a DC 15 Sleight of Hand receipt (`lockpick`), or a DC 15 Athletics
  receipt (`force`). Open it, then take the quill. Discovery and unlocking are
  independent gates; unlocking alone leaves it closed.

Talking and reading are narrative/knowledge actions; engine commands handle movement,
discovery and possession. The speedruns cover theft, a negotiated ten-gold purchase,
combat/looting, lockpicking and forcing the lid. Buying represents negotiated consent;
it is not a fixed shop price. Marta's account of Brann's marked cards gives Ilsa a
way to clear her debt without paying. Doran seeks the stranger's allegiance, while
Mael's private orders pull her toward keeping the quill for the temple.

## Map and mechanical conventions

The 26×16 map follows `buildTiles()` and `ENTITIES` in the UI prototype. Kael uses
`char:kael`; the third barrel uses `container:old-barrel`. Marta, absent from that
prototype's cast, stands at (22, 10). The cellar hatch is a walkable tile and
`loc:hatch` spot; stairs and the entrance/kitchen doors are also walkable, with no
locked engine door obstacles. Upstairs and the cellar have no location records:
the seed schema requires map bounds, and these areas are off-map.

The common-room rectangle covers the interior. Smaller bar, stage, kitchen and
stairs rectangles take precedence under engine movement; hearth/hatch spots resolve
to their parent room. The kitchen bounds include its doorway at (18, 11).
All containers occupy walkable tiles at prototype positions. The engine permits
blocked furniture positions for containers and uses same-room access, but these
containers are entity sprites over floor, not collision furniture. Hidden containers
are absent from the decorative tile layers so those layers do not reveal them.

Two separate consumables represent the healing potions. Call `heal` with the potion
ID and `dice: "2d4+2"`; the engine consumes one item and does not parse its prose
properties. Weapons have explicit `damage` and `ranged`/`finesse` tags where applicable;
Kael has `darkvision`. Shield protection is included in Doran's starting AC; the
seed schema has no equipment slots. Treasure coins remain an item valued at 12 gp;
picking them up does not automatically add to character gold.

## Frames and editing

The original CC0 Kenney 1-Bit Pack and licence are in `../assets/kenney-1-bit/`.
The colored packed sheet has 49 columns, 22 rows, 16×16 tiles and no spacing.
`kenney-1-bit:N` is a zero-based frame; Tiled uses gid `N + 1` (gid 0 is empty).
Frames follow the supplied art list; palette recolouring belongs to the client.

Open `tavern.tmj` in Tiled, keeping its embedded tileset's relative image path.
Use finite orthographic, uncompressed JSON tile arrays and the existing six layers:

- `floor`, `walls`, `furniture`: decorative tiles. Floor, rug and stage stay walkable.
- `collision`: hidden tile layer; any nonzero gid blocks movement. Walls, shelves,
  counters, tables and the hearth block; doors, stairs and the hatch do not.
- `entities`: point objects at tile centers (`x * 16 + 8`, `y * 16 + 8`), each with
  one string property `id` matching a seeded character or container.
- `rooms`: tile-aligned rectangles with a string `id` matching each seed location,
  including the building and spots. Pixel rectangles must equal `tileBounds × 16`.

Keep object/layer offsets and rotation at zero. Update seed placements and bounds
alongside map edits, and add sprite mappings when introducing new tags or entities.
The loader accepts standard editor metadata but rejects unsupported geometry.
From the repo root, run `npm run content:check`, then `npm test`.
`npm run graph:seed` loads `.env`, validates content, clears the configured Neo4j
graph and projects Episode N. It does not create a session event log.
