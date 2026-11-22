# NPC voice rules

Inject `createNpcVoice({provider})` into BeatContext. Use voice_npc through the
registry for presence, consciousness, role and per-beat caps. The implementation
reads the pending knowledge slice and persona; direction is the sole DM-originated
input. Visible characters expose only names and appearance. Unknown implications
in a direction must be deflected or treated as speculation, never established.

Output is a validated, nonempty single line of at most 60 words. IDs use a sequence
scoped to BeatContext, shared across voice instances, and avoid existing IDs.
Only successful tool calls register lines. Invalid output, refusal and other call
failures return NPC_VOICE_FAILED so the DM can narrate around them; provider
unavailability propagates. Use TracingProvider for usage and call traces.
