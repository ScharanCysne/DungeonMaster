# Peer rules

Build each request from `knowledgeSlice`, its last committed narration and the
current player intent. Visible characters expose names and appearances, never
private summaries or backgrounds. Fact truth is not character knowledge. The seed
stores voice in personality. Secrets require both HAS_SECRET and KNOWS.

`runPeer` validates structured PeerTurn output. Failed, invalid, incomplete and
refused calls become pass with a trace reason; LlmUnavailableError propagates.
Use a TracingProvider for provider requests, usage and latency. `peerSayLines`
exposes provisional speech for the future beat_progress stream and BeatContext.
The action's private flag does not make its say line private.

Persist `{nextPeer, consecutivePasses, pending}` only on beat commit. Rotation sorts
IDs, selects at most two, and prioritizes selected/named peers, then pending peers,
then the circular roster. Names match whole words (ignoring titles); ties within
a priority use ID order. Only round-robin selections advance the cursor, so named
peers cannot starve the next ordinary turn. `recordPeerTurns` takes the runner's
explicit unresolved actor IDs; intent alone does not establish a pending action.
Only offered turns change consecutive passes; three passes nudge the next offered
turn, and an intent resets the count. Keep the prior state on abort.

Supply `debugFacts` to run the spec's debug scan against all graph facts; matching
unknown IDs or statements appear in `trace.promptLeaks`, without rendering that
audit catalogue to the model. The sample enables it. Isolation tests scan full
rendered requests. Last narration and player intent must be player-facing inputs,
not DM context. No tools or outcomes are available to peers.
