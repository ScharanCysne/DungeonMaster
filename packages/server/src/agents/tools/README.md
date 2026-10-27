# Tool registry rules

Create a fresh `BeatContext` after `engine.beginBeat`. Inject `Generators` and
`NpcVoice`; generators live in `../generators`, while voice belongs to slice 11. Await
`executeToolCall` calls sequentially in model order. Only `narrate` ends the loop;
`voice_npc` is classified as `soft` because it does not end it. A finished context
accepts replacement narration for critic corrections; state-changing retries need
the later beat orchestrator's explicit retry policy.

- Registry order is fixed for prompt caching. Definitions use the shared Zod
  input/output schemas. `toolDefinitionsForApi` returns strict Anthropic params;
  `toolSchemasForProvider` adapts the same conversion to the existing provider.
- Strict input objects require every property and forbid extra properties at all
  depths. Optional fields are nullable on the API wire; `executeToolCall` removes
  their null sentinels before shared Zod validation. Local callers may omit them.
  Required nulls and extra keys still fail. Use this executor for registry calls,
  rather than the provider's lower-level `validateToolInput` helper.
- JSON Schema uses inline schemas and rejects references/cycles and
  `patternProperties`. Regex, numeric bounds and length bounds are omitted from
  the wire schema conservatively and still enforced by Zod. Cross-field rules and
  word counts also remain in Zod and model descriptions. The emitted `anyOf`
  unions, nullable alternatives, `const` and integer types have not been checked
  against the live API; the offline tests cannot establish API acceptance.
- Every attempt consumes its applicable counters, including invalid inputs,
  unknown tools, handler failures and calls over a limit. Ordinary calls default
  to 8; generator attempts also consume their separate cap of 3. Voice attempts
  have a separate cap of 4. Narration and voice never consume the ordinary cap.
  Limits are checked before validation or delegation. Rejections leave gameplay
  state unchanged, except for the engine's documented initiating-attack exception.
- `ctx.events` is the single ordered, detached draft stream. Engine collection
  runs after every engine or generator call, including failures. New engine drafts append at
  that call's position; earlier slots refresh so later contested checks can revise
  witnesses. Successful soft/generator results append their drafts once. Do not
  append engine result events separately. Draft provenance overrides the event
  log's beat default.
- Soft handlers read committed ontology plus all ordered pending projections
  in a temporary MemoryStore. They never write the committed store. Presence and
  consciousness use current engine state. Discard the context and roll back the
  engine on abort; commit the combined drafts only after the critic accepts.
- `share_fact` uses the explicit teller's current room, even away from the player;
  without a teller it uses the player's room. Only active, unretracted KNOWS
  qualifies an explicit teller. Recipients must exist and be in that room;
  consciousness is not an additional sharing prerequisite. Duplicate recipients
  are collapsed. Learning uses confidence 1 and the requested source.
- Attitudes start at zero when absent and accumulate within the beat. Clamp the
  resulting value to -100..100; retain the requested delta in the event. Fact IDs
  use `uniqueId` against committed and pending entities. `create_fact` knowledge
  uses source `witnessed`, confidence 1; `supersedes` follows normal projection
  and retracts the learner's previous belief.
- Soft drafts are private: attitude witnesses are `[from]`; learning witnesses
  are all recipients plus an explicit teller; creation witnesses are `knownBy`;
  quest witnesses are the single personal-quest pursuer. All `create_fact` drafts,
  including learning, use `createdBy: 'dm'`; other soft drafts use `'engine'`.
  Generator implementations supply their own provenance and must validate before
  returning drafts. The test fakes supply registered output without real generation.
- Voice requires an existing NPC, conscious and in the player's current room.
  The injected voice must build its prompt only from that NPC's knowledge/persona
  and direction. Successful line IDs must be unique within the context. Narration
  resolves those IDs and verifies exact peer speech and peer role before recording
  `ResolvedNarration`; its ToolResult retains the shared reference-form narration.
  The later critic checks speaker presence/consciousness at narration time, hidden
  references, unspent receipts and claims unsupported by events. Narration itself
  emits no committed event.

`npm run llm:tools-check` loads project environment through the standard launcher
and sends one DM request with all definitions, auto tool choice and no SDK retries.
It prints `OK` or the API error with credential redaction. Run it only with network
access; ordinary tests use a fake transport and never run this launcher.
