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

The map preserves a 26:16 frame; Phaser, rich journal reveal, and appendix views
arrive in Slices 15–17. Google Fonts are declared in HTML with local fallbacks;
the build needs no network. Below 1100px, pages stack and bookmarks become a row.
