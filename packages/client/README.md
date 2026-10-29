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
The newest beat has a completed reveal placeholder for Slice 16.

The map preserves a 26:16 frame. Rich journal reveal and appendix views arrive in
Slices 16–17. Google Fonts are declared in HTML with local fallbacks; the build
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
once per game boot into a canvas texture: alpha below 128 becomes transparent;
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
