# Episode N client

In separate terminals from the repository root:

```sh
npm run server
npm run dev -w @dungeon/client
```

Open the Vite URL. `/ws` proxies WebSockets to `ws://127.0.0.1:8787`;
`/healthz` proxies HTTP to the same server. Production hosting must provide these
same-origin routes. The first connected client drives the session; observers see
broadcasts and receive `NOT_DRIVER` if they submit. The wire protocol has no role
notification, so the client displays that server error rather than guessing a role.

One Zustand store uses pure server and local-action reducers. The network boundary
validates both directions and retries from 1 to 30 seconds. Receipt timestamps are
injected into state; reducers never read the clock. After live commits, a repeated
hello refreshes visible nodes because reveal events carry IDs only. Snapshot
freshness and `lastSeenBeat` are separate so replay cannot rewind the world.

Journal entries are a typed flat list: beat headers, your intents, dialogue,
stamps, narration, notes, and chapter ends. Progress lines match committed lines
one-for-one by beat, speaker, and exact text. Unmatched or paused lines are struck;
a retry creates new provisional lines. Committed dialogue includes resolved lines
and witnessed peer speech from intent events. Stamps use shared `formatRollStamp` on
witnessed check/attack events. Ground truth stays in the dev slice. Snapshot
narration has no beat IDs, so it is temporary context until replayed results arrive.
The newest committed beat enters `revealing`; a plain `journal_revealed` action
marks it complete, ignoring callbacks from older beats. Historical replay below
the snapshot beat is instant. Already-visible progress lines stay visible when
finalised, so commit never makes a peer line disappear.

The map preserves a 26:16 frame. Google Fonts are declared in HTML with local fallbacks; the build
needs no network. Below 1100px, pages stack and bookmarks become a row. Companions
and satchel scroll within their panels, including the final gold row.

## Map module

`src/map/MapView.tsx` owns one Phaser 4 game per mount; `game.ts` handles teardown,
resize observation and live reduced-motion preferences. React page components stay
presentational. The bridge forwards world, selection, beat feedback, cue and DM-overlay
changes. Phaser emits `entity-clicked {id}`; the bridge rechecks visibility before
toggling store selection. Empty tiles have no input handler. Keyboard input and
autofocus are disabled in Phaser; cards and satchel rows retain Tab/Enter selection.

Assets stay in `content/`: Vite imports the original sheet with `?url` and the TMJ
and manifest with `?raw`. Production bundles contain the PNG and both JSON sources;
there is no copied public asset tree. The dev server allows the repository root,
and Vite environment-file loading is disabled. `mapData.ts` reads only decorative
floor, walls and furniture layers in that order; collision and object layers never
create entities. Normal positions come from the player's store snapshot; DM placement is described below.

`palette.ts`, `fit.ts`, `renderModel.ts` and `motion.ts` are pure. Recolouring runs
once per browser module lifetime into a shared canvas: alpha below 128 becomes transparent;
otherwise RGB becomes red ink only when red exceeds both other channels by more
than 40, and ink otherwise, retaining alpha. Characters use fill tints:
player `#4b2520`, peers `#35424a`, NPCs `#2b1d12`. Tiles and objects retain the
sheet's warm red accents. Sprite resolution is persisted `sprite`, manifest ID
override, first matching entity tag, then kind fallback.

The scene draws this model using Phaser 4 `pixelArt`, `roundPixels`, nearest texture
filtering and a container scaled by `mapFit`: whole numbers when 2× or more fits,
otherwise a fractional fill, centered in the canvas. ResizeObserver
resizes the canvas without CSS stretching. Below the native 416×256 size the frame
scrolls at 1×. Selection silhouettes use `setTint(...).setTintMode(TintModes.FILL)`;
the deprecated `setTintFill()` is a no-op in Phaser 4. Labels use Pixelify Sans.

The reducer retains only the latest live beat's changed IDs and movement events.
Markers clear on the next beat, and snapshot/replay cannot introduce old movement.
The pure timeline samples every engine path at eight tiles/second in event order,
including repeated moves by one entity; selection updates do not restart it.
Progress cues only flip or hop one pixel, return to rest, and clear on pause/commit.
Reduced motion snaps movement and omits cues. Tests mock the game boundary and use
the real store and pure model; never import or boot Phaser/WebGL in jsdom.

## Journal, composer and possessions (Slice 16)

`ui/reveal.ts` is the pure ink-in scheduler. The first roll stamp appears immediately;
subsequent stamps begin every **150 ms**, each with a 150 ms stamp effect. Narration
starts after the stamps: **25 ms per whitespace-delimited word (40 words/second)**,
retaining punctuation, spaces and line breaks. Complete dialogue lines then event
notes each occupy a **150 ms** slot. Headers, intents, provisional/withdrawn lines,
pause notes and the Slice 18 chapter-end placeholder are immediate. A 25 ms timer
samples elapsed time; it stops at completion or skip. Clicking the journal or any
key skips without preventing that key's normal action. Reduced motion is instant
and responds to preference changes. The next intent remains editable throughout.

The journal follows every reveal update while within **24 px** of the bottom.
Scrolling up preserves the reading position and displays **↓ new entries** when
content changes; clicking it resumes following. A ResizeObserver follows later
font/layout changes, and bottom padding keeps the last NPC line above the composer.
Companions and satchel have a 220 px minimum area and independent overflow, including
gold; long inventories scroll inside the satchel at desktop book sizes.

Composer submission is blocked during running/paused beats, pending submission,
disconnection, missing world, or chapter end. Typing is allowed except at chapter
end. Enter and Write send `player_intent`; successful network submission records
history and clears chips. Escape clears selection; ArrowUp recalls the last text
only with an empty input or the caret at the start. The first selected entity
chooses static example verbs (character, container, item, feature/location).
Input is capped at 500 characters, with a counter from 450. The running status uses
the CLI wording and a one-second elapsed ticker, e.g.
`DM is resolving… 3 actions · 18s`.

Party class comes from recognised class tags and level from an explicit
`level N` in the summary, since Character has no separate class/level fields.
Missing details are omitted. Portraits, dialogue portraits and item icons use the
map's `resolveFrame` and the **same cached recoloured sheet**, published as a data
URL for CSS sprite crops with pixelated scaling. Phaser receives a copy of that
canvas so destroying a map cannot destroy the shared image; there is no second
recolour or per-portrait canvas.

`world.acquiredAt` records witnessed `ItemTransferred` events into the player's
inventory from another holder. A carried item is **new** when that acquisition beat
equals `world.beat`, regardless of its creation beat; the badge lasts until the next
commit. `world.equipped` follows witnessed player equip/unequip events and removes
items on transfer away or hiding. Metadata survives snapshot refreshes and is rebuilt
by replay without rewinding snapshot inventory/HP/gold. Snapshots do not contain
equipment, so seeded equipment without an equip event cannot be inferred and is
not guessed. Other characters' equipment never contributes badges.

Beat narration retains its trace ID. With dev tools enabled the layout requests
committed beat traces; a trace outcome of `fallback` adds the **critic fallback**
margin link to the Trace appendix, without changing narration. No fallback is
inferred from prose. Trace navigation is described below; chapter-end actions are described below.

Tests use Vitest + React Testing Library, fake clocks, mocked media preferences,
and explicit scroll geometry. They cover scheduler boundaries, skip and reduced
motion, scroll following, provisional lifecycle, submission/drafts/history/limits,
status ticks, cards/badges, keyboard selection, and inventory replay metadata.
Run from the root: `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build -w @dungeon/client`. No test boots Phaser/WebGL or requires network.

## Appendix, DM view and Inspector (Slice 17)

Developer mode starts unknown. A successful `debug_response` or a beat carrying
`groundTruth` enables the DM and Inspector toggles; no client environment flag is
used. The three bookmarks remain available to probe the server. `DEBUG_DISABLED`
shows “Developer views are disabled on this server (DUNGEON_DEV)”, clears debug
caches and overlays, and returns to the book without changing the draft or selection.
Other debug errors stay in the appendix instead of becoming composer errors.

Opening a bookmark requests its view; open views refresh on every accepted
`beat_result`. Inspector requests all three. Selection changes refresh the graph;
agent changes refresh knowledge. Responses are cached by the plain dev reducer.
Committed narration traces are fetched in developer mode even with the drawer
closed, so fallback margin links can appear. The hooks live at the layout boundary;
views receive data and callbacks and never access the store or socket directly.

Graph focus is the ordered selection, or the player. The actual v1 protocol uses
`target: ids.join(',')`; the server always unions **depth-one** neighbourhoods, so
there are no unsupported `focus`/`depth` fields on the wire. `graphModel.ts` sorts
nodes by ID and edges by type/from/to. The thin Cytoscape adapter uses **concentric**
layout, with unique ID-order ranks, six ranks per ring, a fixed start angle,
clockwise ordering and no animation or randomness. Identical input and viewport
produce the same arrangement. The keyboard node list provides the same popover and
selection action as the canvas. Facts, quests, events and unseen entities only open
details; visible entity clicks also toggle selection.

Type colours match the prototype legend. Dashed red borders/lines indicate changes
from provenance in the latest beat, comparisons with the previous ground-truth graph
(or previous graph response when truth is unavailable), and witnessed map-change IDs
for nodes. Seed beat zero is not highlighted. Removed nodes/edges are absent from the
new graph. Without a prior graph, older mutations cannot be inferred.

There is **no edge visibility flag** in the protocol. DM-only styling is a conservative
client interpretation: an edge with an endpoint absent from the visible world;
another character's KNOWS, WITNESSED, CARRIES or EQUIPPED edge; or any HAS_SECRET,
WANTS, PURSUES or ATTITUDE edge. These edges get ordinary dashed rule ink only in DM
view; changed edges always get dashed red ink. The debug graph itself is privileged
server data in either mode; this styling is not an authorization boundary.

“Open in Neo4j Browser” points to `http://localhost:7474/browser/?cmd=edit&arg=…`
with a URL-encoded Cypher query matching focus IDs and their adjacent relationships.
It prefills an editable query, requiring Browser support for these URL parameters,
a running Browser and a selected database. It does not execute a query or connect
from the game client; a memory-backed server need not have a corresponding Neo4j
world. The one-hop query is label-independent and quotes IDs as JSON strings.

Trace cards keep the latest attempt of each beat, newest first. Validated provider
response blocks supply tool uses; subsequent request histories supply their results,
including engine rejection messages. Repeated request history never creates duplicate
tool rows. A result absent from the wire trace (often the final `narrate` call, because
there is no next DM request) is explicitly marked unknown, not inferred successful.
Critic call outputs and `CriticRejected` events preserve issues even after a successful
retry. Retry count is critic calls minus one; session attempt is shown separately.
Cache hit percentage is `cacheRead / (input + cacheRead + cacheWrite)`, since provider
input usage excludes cached reads/writes; empty usage gives 0%. Raw JSON is collapsible.
Fallback links open and focus the matching beat's card without altering narration.

Knowledge offers party and known visible characters, plus ground-truth characters
in DM mode. Goals use quest objectives supplied by the knowledge slice. Known facts
show source, confidence and learning beat, followed by secrets and attitudes. The
latest leak check is labelled beat-wide because the wire has no per-character check
result. Truth flags and the unknown-fact list require both DM view and ground truth;
secrets count as known. Switching DM off also removes hidden agents from the picker.

The pure map model adds gold dashed outlines and holder notes from ground truth.
Hidden containers have exact tiles. Held items use their holder's position; other
hidden entities with only LOCATED_IN use the location's top-left tile and explicitly
say “location only; tile unknown”. Entities with no recoverable position are omitted.
Hidden sprites cannot select unseen IDs. Visible holders also receive `holds item:…`
notes. No map overlay is built without current ground truth, and Phaser only draws
model fields. Truth from a previous beat is discarded if the next result omits it.

Backtick or the small header toggle switches to the Codex-coloured Inspector:
party/satchel/knowledge left, map and journal/composer centre, graph and trace right.
Composer and journal chips show raw IDs. The Phaser island is **destroyed and
recreated**, rather than re-parented, on each layout switch; its existing teardown
removes subscriptions, resize/media observers and the old game. The new instance
renders current store state. Selection, draft text and journal scroll/follow state
stay in the store. Drawer opening keeps the story mounted but inert, moves keyboard
focus into the drawer, and closing restores focus. Escape in the drawer closes it
without clearing selection. Backtick ignores inputs, textareas, selects, editable
content, composition, modifiers and repeats. Native controls and the graph node list
keep both layouts keyboard reachable.

Tests mock only the Cytoscape adapter and Phaser game boundary. Pure models and RTL
cover detection/disabled behavior, fetch and refresh, graph colouring/changes,
provenance and selection, trace failures/metrics/retries, knowledge/DM gating,
map overlays, fallback navigation and layout/keyboard/state preservation.

## Pause, chapter end and replay (Slice 18)

Both book and Inspector use the same presentational session components. Pauses
show a parchment overlay with plain-language reasons and a receipt-relative
countdown. Retry now and Save and quit send session commands. Budget pauses use
the server-advertised dollar step for Raise by $N and offer Stop. Automatic retry
scheduling remains on the server; the client displays “Checking” at zero and
waits for the next pause/resume message. Provisional dialogue remains struck.
Developer pauses show the underlying error code and a trace link that opens the
attempt card inside the overlay. Saving closes the overlay and disables writing.

An episode ending replaces the journal viewport with the final chapter page.
It shows the holder's visible name, beat count and server recap. Acquisition uses
only the winning beat's witnessed quill transfer (pickup, gift, purchase, theft or
loot); otherwise it says “Out of sight.” A peer holder gets a next-episode hook
without revealing a private agenda. Developer buttons send `replay_session` or
`start_new_run`; the latter waits for `session_reset` and a fresh seed snapshot.
The composer stays disabled after ending.

`replay_info` enables the timeline above the journal, with previous/next, a beat
slider and the current/total count. Beat zero is the seed. Every seek sends
`replay_seek`; `replay_state` atomically replaces world and filtered journal history.
Inventory badges are reconstructed without reapplying old HP, gold or position
changes over the authoritative snapshot. Selection, draft, animation, trace, graph
and knowledge caches reset on a seek, while layout, DM view and appendix choices
are preserved. Open developer views refetch at the selected beat. The map uses the
same store subscription as live play. All views therefore move backward together.
The composer input and submit action are disabled with “Replay - read only”.
The ending is shown only at the ending beat, without live-session action buttons.

RTL fake-timer tests cover all pause reasons, custom budget steps, countdowns,
commands, trace navigation, resumed/save cleanup, final pages and hooks, and both
layouts. Pure reducer tests cover backward seeks, metadata, cache resets and new
runs. Server tests cover perspective parity and the nine-beat replay bound.
