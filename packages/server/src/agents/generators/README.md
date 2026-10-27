# Generator rules

Inject `createGenerators({ provider, sprites })` into a fresh `BeatContext` and use
the real tool executor sequentially. Registration reads committed graph state plus
all ordered pending events; it never writes the committed store. Commit that stream
after acceptance, or discard the context and roll back the engine on abort.

- Item, NPC and feature use role `generator`; story uses `story`. Config defaults
  both to Sonnet 5.5. Versioned stable instructions precede per-call context. Raw
  `generated*` schemas go through `outputFormat`, without tools or tool choice.
- One response is validated with Zod, policy, references and duplicate checks before
  registration. One validation retry includes the problems. Exhaustion, refusal
  and request errors return `GENERATION_FAILED`; unavailability propagates.
- Item constraints may tighten config rarity/value limits. NPC stats use config;
  the episode cap counts graph NPCs with generator provenance, including pending
  creations and excluding seed NPCs. NPC starting items obey the item rules in the
  same atomic batch and consume no additional generator calls. Hints are advisory.
- Names use shared `slugify` normalization across all non-event nodes. Tag overlap
  uses sets of trimmed, NFKC-normalized lowercase tags, Jaccard >= 0.8, with empty
  unions ignored. It compares items (all subtypes), characters, or containers at the
  exact same location (including carried/contained items), plus staged inventory.
  Story de-duplication compares full statements, so shortened names may collide.
- Motifs are graph-derived, counting each normalized tag once per node whose
  `createdBy` starts with `generator:`. The prompt lists the top 12 by frequency,
  ties lexically. There is no independent mutable motif cache to roll back.
- Context includes the first positioned reference's location, its descendants and
  contents, direct references, their ABOUT facts, and existing names. Story critic
  entries preserve the exact shown ABOUT facts, including truth, as `basedOn`.
  A compact comma-separated list of manifest sprite tags ends every request,
  after validation problems on retry. Items (including NPC inventory) and features
  require a catalogue tag; prompts request the closest category first, followed
  by descriptive tags. Missing catalogue tags consume the existing single retry.
- `uniqueId` assigns IDs; generators assign provenance and beat. Fact names use
  the first six shared-slugify words after dropping leading a/an/the, capped at
  43 characters at a word boundary (only an oversized first word is cut). IDs
  use that stem with `uniqueId` suffixing, shortening it further as needed to keep
  the entire ID within 48 characters. Full text stays in statement and summary.
  The shared registrar covers item histories, NPC secrets/inventory, and story;
  features currently have no fact fields.
- Items always have `questCritical: false`. Physical nodes persist `sprite` in
  creation events for replay. The first normalized catalogue match wins. Unmatched
  items/features use kind fallbacks; Episode N uses treasure frame 237 for generic
  items/tools and the tools tag, keeping explicit seed overrides intact.
  NPC matches must map to a pool/seeded character frame. Role matches win; generic
  human and unmatched roles instead hash the NPC ID
  with 32-bit FNV-1a into frames 25, 26, 76, 78, 79, 80, 126, 127, 173, 174, 175,
  176, filtering character overrides out of that pool. None overlap Episode N's
  nine seeded character frames. NPC role tags are optional, unlike object category
  tags. Raw schemas cannot set sprites. The injected manifest is never mutated.
- Pure `Engine.createEntities` atomically creates an NPC and inventory, a feature,
  or an item. It validates holders, uses the replay registrar and emits creation
  events with event-time witnesses. The executor collects these before soft facts.
  Creation is a system action; it neither spends a turn nor changes active initiative.
  Nearest placement uses Manhattan distance from a feature's preferred tile, or
  the location's top-left for NPCs; ties use row then column. Tiles must be walkable,
  inside the exact target bounds, and free of characters, containers and doors.
  Features start empty/closed; hidden/locked features require the corresponding DC.
- Initial NPC attitudes are full seeded `ATTITUDE` edges, bounded -100..100; they
  are not changes subject to the per-call delta cap. Secrets use `FactCreated` with
  ABOUT and optional `secretOf` (projects HAS_SECRET), then private `FactLearned`
  for the NPC, source `deduced`, confidence 1. Backstory gets ABOUT and ORIGIN_OF;
  story backstory gets ORIGIN_OF for its item/character subjects. Item histories and
  story facts have no automatic learners. Generated facts cannot concern protected
  quest items. Lore consistency is handed to the later critic, not inferred here.
- `npm run gen:sample` uses real Episode N, Anthropic and an in-memory trace. Nine
  calls run over three beats to retain normal registry caps. It projects accepted
  sample drafts between beats, prints compact results and summed trace cost/latency,
  plus generatedEntities, spriteFallbacks and spriteFallbackRate (0..1). Counts
  include accepted physical entities and NPC inventory; NPC pool choices count
  as fallbacks. Facts and failed attempts do not count. A tag match is not a
  fallback even when the selected frame equals the kind fallback.
  The sample writes no session log. Live model validation requires network access.
