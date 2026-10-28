# DM rules

Create a fresh `BeatContext` after `engine.beginBeat`, supplying exact peer say
lines, generators and an NPC voice. `createDmBeat({provider, ctx, seed, intents})`
loads the versioned principles/rules and query context; `run()` resolves one beat.
Keep the returned `DmBeat` for one `retryNarration(issues)` call from the critic.
Commit or roll back outside this module. A result is `narrated`, `noNarration` or
`refused`; unavailable providers propagate to the caller. There is no neutral
summary here. Neither `run` nor the retry commits anything.

The role is `dm`; the provider reads model and effort from its shared config
(default Opus 5.5, medium). Pass the same config to the provider and `BeatContext`.
System blocks are principles/rules, initial episode premise/lore, then optional
recap. Only the first two and the last tool carry explicit 1h cache breakpoints.
Every DM request sets `cacheTail: '5m'`, including narrate-now and critic retry.
The provider sends top-level `cache_control` to move an automatic breakpoint to
the last cacheable conversation block. This uses the fourth slot, after the
longer TTLs. Recap has no separate breakpoint; it is covered by the tail cache.
It is atmosphere supplied by the caller from `RecapUpdated` in the event log;
this module neither generates recaps nor treats them as ground truth. The graph
does not project recap text. Tools and automatic tool choice stay fixed for the
whole conversation, including recovery and critic retry.

Dynamic context uses the existing DM/selection/knowledge queries and live engine
combat turn. The DM query includes the whole building, so other rooms remain
ground truth even though the player cannot perceive them. It includes the current
holder chain of the quest item. The default recent-event window is 20, plus present
NPCs' witnessed excerpts and the last three committed narration summaries. Arrays
with no gameplay order sort by ID; event excerpts sort by beat and sequence.

The deterministic token estimate is `Math.ceil(text.length / 4)`, using JavaScript
UTF-16 code units. It is a budget estimate, not a tokenizer. The target defaults to
`config.input.contextBudgetTokens` (12,000). Remove oldest event excerpts first,
then additional one-hop neighbour nodes of non-selected physical entities, by ID,
with their incident edges. Never remove core state, NPC knowledge, selections,
intents or the three narrations. Protected selection neighbourhoods can retain an
event also removed from the general event excerpts. `droppedContext` records IDs,
before/after estimates and any unavoidable overage. A target is not a hard cap.

Execute tool calls sequentially, with one ordered user turn containing all results.
Preserve the full assistant content, including thinking and fallback blocks. Stop
on the first successful `narrate`; later calls in that response receive errors.
Failed `max_tokens` turns execute no tools, return errors for any tool blocks and
preserve the original assistant turn before recovery. Missing narration, the
ordinary cap (12 by default), or exhausted progress turns gets a narration-only
finishing turn:

> Narrate now using only established events and facts. Call narrate once; do not call other tools.

Invalid or handler-rejected narration returns its actual tool error and allows up
to two further narrate attempts. The initial loop and its finishing turn share a
maximum of three executed narrate calls; the finishing turn does not reset this
allowance. Calls beyond that bound in the same assistant turn receive errors
without executing. Narrate attempts never consume the ordinary tool-call cap.
Each repair first lets the model respond to the tool result. If it does not call
narrate, append a narrate-now user turn containing the latest narration error
message verbatim. Ignoring that reminder spends one repair opportunity. Repair
turns reject other tools locally, while keeping tools and automatic choice fixed
and preserving append-only history. Exhausting repairs returns `noNarration`.

Repeated invalid narration or voice-only responses cannot loop indefinitely.
Ordinary turns are bounded by ordinary-call limit + voice limit + 1. A finishing
turn and at most four repair turns (two responses plus two reminders) can follow.
Without a narration error, ignoring the finishing turn still returns `noNarration`.

Critic retry is narration-only unless an issue is `unbacked_outcome`. That allows
`min(2, config.limits.retryToolCallsForUnbackedOutcome)` additional non-narrate
attempts, including failures, unknown tools and voice. This conservative allowance
is separate from the original ordinary cap. Generator and voice caps remain
per-beat; counters and drafts are never reset. The rejected narration is cleared
before retry, so a failed retry cannot accidentally return it. Existing voiced
line IDs remain usable. The original proposal and all results stay in history.
The critic retry has its own three-attempt narration allowance with the same
repair rules, for at most six executed narrate calls across `run()` and the one
`retryNarration()`. Its ordinary turns are bounded by its non-narrate allowance + 1,
followed by at most one finishing turn and four repair turns. Refusals and provider
unavailability still end or abort either loop immediately.

Results contain detached cumulative metrics and tool traces across the initial
loop and retry. `iterationUsage` records each provider turn's one-based iteration
and usage, including fallback detail; usage is null for refusals without a response.
Usage, cost and latency sum the DM provider responses (including
billed refusals), not delegated generator/voice calls or local execution time.
`fallbackUsed` reports provider fallback use, not the narrate-now recovery.

`npm run dm:sample` uses the standard environment launcher, real Episode N, real
generators and an NPC voice stub returning `(voice stub) ` plus the direction.
It prints two beats with all calls, narration/lines and DM metrics, plus uncached
input, cache read and cache write tokens for each iteration.
It projects beat one in memory before beat two, without the future critic. The
exact supplied first intent includes a hidden floorboard and Brann in another
room; discovery and reach still require tools. It does not adjust seed state to
make the illustrative prose automatically succeed. The second beat shares the
stable prefix so the live API can report cache reads; offline tests do not prove
cache hits or live API behaviour.
