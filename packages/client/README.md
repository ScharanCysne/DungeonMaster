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

The map preserves a 26:16 frame. Appendix views arrive in Slice 17. Google Fonts are declared in HTML with local fallbacks; the build
needs no network. Below 1100px, pages stack and bookmarks become a row. Companions
and satchel scroll within their panels, including the final gold row.

## Map module

`src/map/MapView.tsx` owns one Phaser 4 game per mount; `game.ts` handles teardown,
resize observation and live reduced-motion preferences. React page components stay
presentational. The bridge forwards only world, selection, beat feedback and cue
changes. Phaser emits `entity-clicked {id}`; the bridge rechecks visibility before
toggling store selection. Empty tiles have no input handler. Keyboard input and
autofocus are disabled in Phaser; cards and satchel rows retain Tab/Enter selection.

Assets stay in `content/`: Vite imports the original sheet with `?url` and the TMJ
and manifest with `?raw`. Production bundles contain the PNG and both JSON sources;
there is no copied public asset tree. The dev server allows the repository root,
and Vite environment-file loading is disabled. `mapData.ts` reads only decorative
floor, walls and furniture layers in that order; collision and object layers never
create entities. Positions come exclusively from the player's store snapshot.

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
inferred from prose. Full trace navigation and chapter-end actions remain Slices
17–18.

Tests use Vitest + React Testing Library, fake clocks, mocked media preferences,
and explicit scroll geometry. They cover scheduler boundaries, skip and reduced
motion, scroll following, provisional lifecycle, submission/drafts/history/limits,
status ticks, cards/badges, keyboard selection, and inventory replay metadata.
Run from the root: `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build -w @dungeon/client`. No test boots Phaser/WebGL or requires network.
