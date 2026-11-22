# Literature Review — Episode N Design vs. Prior Art

Date: 2026-10-26. Scope: a quick review, about 45 sources opened across three research
passes, compared feature by feature with [`spec.md`](spec.md).

**How to read this.** Each feature has the most relevant prior art (with links), how
our design compares, and a verdict. Recommendations are tagged **KEEP** (prior art
supports what we have), **ADJUST** (change something we specified), **ADD** (something
we don't have) or **DECIDE** (a trade-off that is the user's call). The last section
gathers every proposed spec change in priority order.

**Source quality.**
- Several sources were read only as abstracts or snippets. Those are marked
  *(abstract)*.
- Several 2026 papers are preprints that haven't been peer-reviewed.
- Two load-bearing claims were checked against the full papers: Labyrinth's
  state-accuracy numbers and the response-delay study. Both hold up. The delay study
  comes with a caveat, noted under Feature 8.

## Overall verdict

The core architecture matches what the field converged on, and in several places it
goes further:

- **An engine that owns state, changed only through validated tool calls**, beat every
  alternative tried. Even with functions, GPT-4's state updates were under 50%
  accurate (Labyrinth), so the model must never be the record.
- **Isolating agents' knowledge by construction**, rather than telling them to keep
  secrets, is the right call. Prompted secrecy leaks 39–57% of the time (ConfAIde).
- **Logging outcomes and replaying without LLM calls** is the correct basis, because
  hosted LLMs are not reproducible even at temperature 0.
- **The schema → bounds → retry generator pipeline** is stricter than the published
  systems.
- **Clicking to select plus free text** is well supported by research on pointing to
  resolve references.

The weak spots are specific:
1. **NPCs voiced by an omniscient DM.** This is the setup that leaks most in the
   literature.
2. **A roll with no follow-up state change.**
3. **Latency** with nothing on screen for most of a beat.
4. **Contradictory facts in a knowledge slice.**
5. **Prompt caching that can quietly fail.**

The review also found a **bug in the spec**: the knowledge-slice Cypher query is
invalid.

---

## 1. LLM as DM, and who owns state

**Prior art**
- **AI Dungeon.** All memory is text (Plot Essentials, Story Cards, summaries), with no
  built-in game state or dice. Its well-known consistency problems are what we're
  avoiding. <https://help.aidungeon.com/new-player-guide>
- **FIREBALL** (ACL 2023). About 25k real D&D sessions with game state from the Avrae
  bot. Adding true state improved narration on automatic and human metrics, and the
  LLM could emit commands that actually run. <https://arxiv.org/abs/2305.01528>
- **Labyrinth GM** (2024). A GPT-4 GM with a dice function plus 13 state functions.
  Using all functions gave the best consistency rating (4.38). But state-update
  accuracy in 30 unit tests averaged **0.42** (all functions) and **0.46** (state
  functions only), against 0.27 when GPT-4 tracked state with no functions.
  <https://arxiv.org/html/2409.06949v1>
- **ChatRPG v2** (2025). Splitting a ReAct Narrator from an "Archivist" that updates
  state through tools beat parsing state out of prose on all 14 measures (9
  significant). Tool behaviour was very sensitive to how the tools were described.
  <https://arxiv.org/html/2502.19519v2>
- **Intra** (Bicking, 2025).
  - Facts are "determined outside of narrative demands", in an append-only update
    stream.
  - Player input is rewritten so players can't decide their own outcomes.
  - He dropped tool calls because cheap models handle them badly.

  <https://ianbicking.org/blog/2025/07/intra-llm-text-adventure>
- **Friends & Fables** keeps TTRPG state in a database, and the engine runs "state
  checks" before the model narrates.
  <https://fables.gg/blog/how-is-friends-and-fables-different-from-chatgpt-ai-dungeon-or-novelai>
- **Orchestrated Reality** (2026, preprint without results) proposes a
  Plan → Diff → Validate → Apply pipeline. <https://arxiv.org/abs/2606.16014>

**Comparison.** We follow the strongest pattern: engine authority, tool calls checked
against schemas, an append-only log. Where we differ:
- One strong model both judges and narrates, where ChatRPG splits Narrator from
  Archivist. Our split is between the engine and the DM, which goes further.
- We use real tool calls, where Intra uses inline tags. That's fine with an
  Opus-class DM.
- We add check receipts and a critic, which none of these systems has.

**Verdict:** **KEEP** engine authority and the event log.
- **ADD intent normalization.** The DM treats outcomes a player or peer asserts ("Brann
  doesn't notice") as *attempts*, and the critic flags narration that adopts them as
  fact (Intra).
- **ADD a tool-selection regression suite** (state + intent → expected tool calls),
  because tool behaviour is very sensitive to wording (ChatRPG, Labyrinth).
- **ADJUST:** the rolling recap is built from the event log and is never treated as
  ground truth by the critic. AI Dungeon's lossy summaries are the failure to avoid.

## 2. Enforcing rules (dice, success without a roll, invented content)

**Prior art**
- **Labyrinth failure modes:**
  - **No dice tool:** play deadlocks waiting for rolls, or the GM makes up outcomes.
  - **Dice only:** the GM "allows the player's unrealistic moves too easily without
    determining whether they are valid".
  - **After a successful roll:** the GM treated the challenge as settled and never
    called the state update (it called `activate_test` repeatedly and never
    `add_object`).
  - **State tools only:** the GM over-called them.
- **RPGBench** (2025). Models "produce engaging stories but often struggle to implement
  consistent, verifiable game mechanics". <https://arxiv.org/abs/2502.00595>
- **IVIE** (2026). Neuro-symbolic validation of interactive fiction still let players
  get around puzzles because the model behaved inconsistently.
  <https://arxiv.org/abs/2606.13348> *(abstract)*
- **World-State Transformations** (2026). The LLM only picks which pre-scripted
  transformation applies; the symbolic system applies it. State stayed consistent
  (n=8). <https://arxiv.org/abs/2605.24719> *(abstract)*
- **Intra** names "object inflation": made-up objects make every object worth less.

**Comparison.** Check receipts are stricter than anything published and directly block
"success without a roll". Creating content only through generators, plus per-beat
caps, answers object inflation and over-calling. Two gaps remain:
- Nothing forces the follow-up state change after a successful roll.
- The DM picks the DC, so a too-generous GM is still possible.

**Verdict:** **KEEP** check receipts, generator-only content creation and the caps.
- **ADD an "unspent receipt" signal.** A successful check whose receipt no tool uses,
  in a beat whose narration claims the result (taken, opened, hidden), counts as
  `unbacked_outcome`.
- **ADJUST the critic retry.** A retry that can only rewrite narration can't fix a
  missing tool call; it can only remove the claim. For `unbacked_outcome`, allow up to
  2 tool calls on retry, still validated by the engine.
- **ADD an engine guard for quest-critical facts.** The DM's `create_fact` may not
  reference a `questCritical` entity. Facts about the quill come from the seed only, so
  the DM can share them but not invent them. Today only the critic guards this (IVIE's
  puzzle bypass).
- **ADD DC discipline.** The DM states the DC and the reason before rolling, and eval
  reports show how DCs were spread (Labyrinth's permissive GM).

## 3. Narrative fidelity (our critic)

**Prior art**
- **Huang et al.** (ICLR 2024). Without external feedback, LLMs struggle to correct
  themselves. <https://arxiv.org/abs/2310.01798>
- **Chain-of-Verification.** Draft, generate verification questions, answer each one
  *separately*, then revise. This reduces hallucination.
  <https://arxiv.org/abs/2309.11495>
- **NCP-Bench** (2026).
  - The best model kept its narrative consistent in only 42% of runs after 20 turns.
  - Fact conflicts appeared in 40–68% of interactions, and adversarial players are a
    major trigger.
  - Fluency did not predict consistency.

  <https://arxiv.org/abs/2608.08160>
- **ConStory-Bench** (2026). Contradictions are mostly about facts and timing, and
  cluster mid-story. Its checker quotes evidence for each judgment.
  <https://arxiv.org/abs/2603.05890>

**Comparison.** Our critic gets external ground truth, so it isn't the self-correction
Huang et al. found unreliable. Its `quote` field matches ConStory's evidence-backed
judgments. No source reports critic latency or cost, so we'll measure our own.

**Verdict:** **KEEP** a separate critic grounded in state, plus the deterministic
pre-check.
- **ADJUST: check claim by claim.** The critic first lists the narration's claims
  (entities, who holds what, outcomes, who knows what) and checks each one, rather
  than giving one overall verdict (CoVe).
- **ADD** a `temporal_contradiction` issue type (ConStory).
- **ADD adversarial player scenarios** (lies, intents that assert outcomes, attempts to
  rewrite established facts), and track the critic's rejection rate (NCP-Bench).
- **ADD calibration.** A small set of critic decisions labelled by a human, used to
  report the critic's precision and recall (see Feature 9).

## 4. Multi-agent characters with secrets and per-agent knowledge

**Prior art**
- **Generative Agents** (Park et al. 2023).
  - Each agent's memory stream was audited: no agent claimed to know a fact it didn't
    have.
  - The main failures were *embellishing* facts the agent did know, and pulling in
    real-world knowledge.

  <https://arxiv.org/html/2304.03442>
- **ConfAIde** (ICLR 2024). GPT-4 and ChatGPT revealed private information where humans
  wouldn't, 39% and 57% of the time. Privacy instructions and chain-of-thought didn't
  fix it. <https://arxiv.org/abs/2310.17884>
- **FANToM** (EMNLP 2023). LLMs fall well short of humans at tracking who knows what
  when people in a conversation have different information.
  <https://arxiv.org/abs/2310.15421>
- **AvalonBench** (2023). ChatGPT on the good side won 22% of games, against 38% for a
  rule-based bot. LLMs are weak at hidden roles and deception.
  <https://arxiv.org/abs/2310.05036> *(abstract)*
- **TimeChara** (ACL Findings 2024). Role-played characters leak knowledge from later
  in their story. <https://arxiv.org/abs/2405.18027> *(abstract)*
- **Knowledge trees for detective-game NPCs** (2026). Building each suspect as
  retrieve → generate → verify against a knowledge tree cut critical hallucinations
  by 65% and eliminated premature reveals. The cost was some forced-sounding reveals.
  <https://arxiv.org/abs/2609.23043>

**Comparison.**
- Peers only ever see their own knowledge slice. That's isolation by construction,
  which is what the literature says works.
- The engine decides who perceived what, so the model never has to infer it, which
  FANToM says models are bad at.
- **NPCs are the weak spot.** The DM sees ground truth and is told not to reveal it,
  which is exactly ConfAIde's leaking setup. Only the critic stands in the way, with
  one retry.

**Verdict:** **KEEP** peer prompts built only from the knowledge slice, and the
deterministic perception rule.
- **DECIDE: NPC voice calls.** The DM decides *that* an NPC speaks and what they're
  trying to do ("Brann deflects, hints at the old stock"). A fast-tier call that sees
  **only that NPC's knowledge slice** writes the actual line, and the critic still
  checks it. This stops leaks when the line is written instead of catching them
  afterwards. Cost: one extra fast call per speaking NPC per beat. This reverses the
  earlier "DM voices NPCs" decision, so it's your call.
- **ADD to the leak check:** embellishment (new detail added to a fact the NPC knows)
  and real-world knowledge bleed (Park, TimeChara).
- **ADD peer self-leak handling.** If a peer's `say`/`text` reveals one of its own
  `HAS_SECRET` facts, the reveal becomes a `FactLearned` for the witnesses, and the
  trace notes whether it looked deliberate (ConfAIde, AvalonBench).
- **ADD a fact-spread eval metric**: `KNOWS` edges per fact over the beats, with
  unsupported claims audited (Park's spread study).

## 5. Knowledge graphs as world state and memory

**Prior art**
- **Bringing Stories Alive** (AIIDE 2020). A knowledge graph of locations and objects
  guides world generation. <https://arxiv.org/abs/2001.10161> *(abstract)*
- **AriGraph** (2024). A memory graph with semantic and episodic parts beat full
  history, summarisation and RAG in text games. <https://arxiv.org/abs/2407.04363>
- **Zep / Graphiti** (2025).
  - Episodes are stored without loss and link both ways to the facts derived from them.
  - Edges are **bi-temporal**: a contradicting fact *invalidates* the old edge instead
    of deleting it.
  - Graph writes use fixed Cypher queries, never Cypher written by the LLM.
  - DMR 94.8%, against 93.4% for MemGPT.

  <https://arxiv.org/html/2501.13956v1>
- **NCP-Bench.** Missing explicit state tracking is the main cause of fact conflicts.
  A memory architecture cut commitment conflicts from 26% to 4%.

**Comparison.** Our `Fact`/`Event` nodes with `KNOWS`/`WITNESSED` edges are AriGraph's
semantic-plus-episodic split. The event log is Zep's episode store, and writes go
through events, never through Cypher an LLM wrote. **Gap:** there's no fact
invalidation. A character told a false rumour and later the truth gets both facts in
its slice, with nothing saying which replaced which.

**Verdict:** **KEEP** the graph as a projection, event-only writes, and the typed
schema.
- **ADD minimal fact supersession.** A `SUPERSEDES` edge between facts, plus a
  `retractedAtBeat` property on `KNOWS`. The slice then says "used to believe X",
  which is Zep's invalidation scaled down. It's cheap now and expensive later.
- **ADJUST (spec bug):** the knowledge-slice Cypher uses `UNION` across branches that
  return different columns. Neo4j rejects that, so the query must be split into three
  queries or `CALL {}` subqueries.
- *Later:* once facts no longer fit in a prompt, Zep's hybrid retrieval (BM25 plus
  graph traversal) is the next step. Leaving it out of Episode N is fine.

## 6. Event sourcing, replay and determinism

**Prior art**
- **Thinking Machines** (2025). Even at temperature 0, 1000 samples gave 80 distinct
  outputs. The cause is server-side kernels that aren't batch-invariant, so hosted APIs
  can't be replayed.
  <https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/>
- **Temporal** (durable execution). LLM and tool calls run as activities whose
  *results are recorded*. Replay reads the recorded results instead of calling again,
  so activities must be idempotent.
  <https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal>
  *(abstract)*
- **LangGraph time travel.** Replaying from a checkpoint re-runs the nodes after it,
  and the results can differ. Editing state creates a fork.
  <https://docs.langchain.com/oss/python/langgraph/use-time-travel>

**Comparison.** We log outcomes, store witnesses, commit beats atomically, seed the RNG
and replay state only. That's the Temporal model, and it fits the nondeterminism
finding. Our `NarrationCommitted` already stores the full narration and the
speaker-tagged lines, which later NPC memory will need.

**Verdict:** **KEEP** event replay without LLM calls.
- **ADD trace fingerprints.** Each beat trace records the model id, the parameters, a
  hash of the prompt and a hash of the knowledge slice. Real traces can then be turned
  into fixtures for the scripted LLM (Temporal's recorded results as test doubles).
- **ADD idempotent projection.** Graph writes are `MERGE`d on the event id, because
  retries can repeat work.
- **DECIDE: fork from beat N.** Copy the log up to beat N into a new session and play
  live from there, to A/B-test prompts against the same history. You chose state-only
  replay earlier; this is the cheapest way to compare prompts later, so it's worth
  reconsidering, but not for Episode N.

## 7. LLM content generation with validation

**Prior art**
- **PANGeA** (AIIDE 2024). An LLM validator plus a memory server keep generated items
  and NPCs consistent. Results are hedged. <https://arxiv.org/abs/2404.19721>
- **Word2World** (2024).
  - A staged pipeline that removes duplicates **in code** and checks playability with A*.
  - The full system produced a playable world 9/10 times, against 60% with one round.
  - Admitted sameness: stories follow "almost the same set of events".
  - Tile mismatch: a forest story produced no tree tile.

  <https://arxiv.org/html/2405.06686v1>
- **Quest-GPT-2** (IEEE ToG 2024). Players judged about one generated quest in five
  acceptable, with large variation in quality.
  <https://research.aalto.fi/en/publications/generating-role-playing-game-quests-with-gpt-language-models/>
- **Hidden Door** relies on tens of thousands of hand-curated tropes for stronger
  guarantees. Bicking's review describes it as "ungrounded … no 'truth' behind the
  story", with a motif repeated until mismatched socks "were practically a character
  of their own".
  <https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game>

**Comparison.** Typed schemas, numeric bounds and an engine of record put us ahead of
PANGeA and avoid Hidden Door's ungrounded stories. The gaps:
- Duplicates are prevented only by listing names in the prompt.
- Nothing measures sameness across a session.
- Falling back to a sprite by tag is our version of the missing tree tile.

**Verdict:** **KEEP** the pipeline and the single retry.
- **ADD a deterministic near-duplicate check** in the validate step (normalised name
  plus tag overlap with existing entities).
- **ADD a motif log.** Track how often each tag is used in a session and feed "recently
  used motifs" back into generator prompts.
- **ADD an eval metric** for how often the sprite fallback is used.
- **ADJUST:** facts from `generate_story` are checked against the `ABOUT` facts the
  generator was shown (lore consistency).

## 8. Player interaction, latency and presentation

**Prior art**
- **Façade** (AIIDE 2005).
  - Natural-language understanding failed about 30% of the time.
  - The open text box raised players' expectations too far.
  - Two self-absorbed NPCs kept the scene moving and "believably ignored" input the
    system couldn't handle.

  <https://expressiveintelligence.github.io/papers/MateasSternAIIDE05.pdf>
- **Retail Mage / Suck Up! / Status** (GDC 2026 write-up).
  - The "blank canvas problem": players looked for the "right" solution.
  - The lesson drawn: "constrained creativity wins".
  - Loading time after each action was noticeable, and "UI is still unsolved".

  <https://medium.com/@hmason/the-state-of-ai-native-games-lessons-from-the-frontier-3e696a9e3279>
- **Response delays with LLM agents** (CUI '25, 54 participants). Tested 1.5 s, 4 s and
  6.5 s. "Latency above 4 seconds degrades quality of experience."
  - Natural fillers (a thinking gesture plus "Hmm…") improved perceived response time
    at 4 s and 6.5 s.
  - A spinner had no significant effect.
  - *Caveat:* this was **spoken conversation in VR**. A turn-based game you read is
    probably more tolerant, so the 4 s figure is an upper bound to aim for, not a
    measured limit for us.

  <https://arxiv.org/html/2507.22352v1>
- **Revisiting Put-That-There** (2025) sends pointing events with object ids to the LLM
  to resolve "this" and "there"; users point whenever describing gets cumbersome.
  <https://arxiv.org/abs/2511.02378>
- **AI Town** (a16z). A pixel-art town from Tiled maps, with deterministic
  transactional state and LLM calls in separate actions.
  <https://github.com/a16z-infra/ai-town>

**Comparison.**
- Selection chips plus text, with ids checked by the server, is the Put-That-There
  pattern.
- Turn-based beats avoid Façade's real-time authoring burden.
- A check system with real failure answers Bicking's "nearly everything succeeds".
- **The biggest gap:** a 15 s median beat with only a passive "quill scratches…" line,
  which is the kind of indicator that showed no effect.

**Verdict:** **KEEP** chips, turn-based beats and visible roll stamps.
- **DECIDE: stream engine events during the beat.** Rolls, movement and event notes
  come from the engine, so they could appear while the DM is still working; only the
  narration would wait for the critic. This conflicts with our rule that a rolled-back
  beat shows nothing (and the player would see dice change if a paused beat is re-run).
  A safe middle ground:
  - Stream peers' spoken `say` lines immediately as diegetic fillers (peers are
    players, so their speech is their own).
  - Show non-committal activity on the map (characters turning, NPCs reacting).
  - Keep rolls hidden until commit.
- **ADD diegetic fillers** either way: a peer remark or an NPC reacting while the DM
  works (Façade's NPCs, the delay study's natural fillers).
- **ADD gentle affordances.** When chips are selected, the composer shows a few
  greyed-out example verbs (blank-canvas problem).
- **ADJUST metrics.** Track **time to first visible feedback** (aim under about 4 s) as
  well as total beat time.

## 9. Evaluation, testing and cost

**Prior art**
- **Setting the DC / D&D Agents** (NeurIPS 2025 workshop). LLMs play DM, players and
  monsters through function calls. Traces are scored on Function Usage, Parameter
  Fidelity, State Tracking and Function Efficiency, and the authors note that
  "style-conforming narration can diverge from task optimality".
  <https://neurips.cc/virtual/2025/loc/san-diego/128312> *(abstract)*
- **Chhun et al.** (TACL 2024). LLM story judges work for comparing systems but are
  weak per story, and "struggle at providing satisfactory explanations".
  <https://arxiv.org/abs/2405.13769> *(abstract)*
- **Husain, "Your AI product needs evals".** Run cheap assertions on every change, check
  a judge against human labels with precision and recall, and track metrics over time.
  <https://hamel.dev/blog/posts/evals/>
- **Claude prompt-caching docs:**
  - Cache reads cost a fraction of base input.
  - The default TTL is **5 minutes**, with a 1-hour option.
  - Prompts below a per-model minimum length are **silently not cached**.
  - **Changing `tool_choice` invalidates the cached message prefix**, and changing the
    tool definitions invalidates everything.

  <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
- **Mason:** inference cost is "an existential risk". Shipped games cut costs 90–99.9%.

**Comparison.** The scripted LLM in CI plus scenario evals with deterministic checks
matches Husain's approach and D&D Agents' trace axes. Our critic is a per-beat LLM
judge, the setting where Chhun found judges least reliable, but it judges checkable
fidelity rather than quality, which is the right scope.

**Verdict:** **KEEP** the scripted fake in CI, deterministic scenario checks, and the
critic limited to fidelity.
- **ADD repeated runs.** Each scenario runs N times (default 3), and reports show pass
  rates, not a single pass/fail.
- **ADD trace metrics:** tool calls per beat against the cap, the parameter-validation
  failure rate, the generator `ok:false` rate.
- **ADD critic calibration**: precision and recall against human-labelled decisions.
- **ADD** any narrative-quality judge only as a comparison across versions, never as a
  per-beat gate.
- **ADJUST caching:**
  - Log cache read and write tokens on every call, and alert when the DM prefix
    misses.
  - Use the **1-hour TTL** for the DM prefix, since players pause.
  - Check that the generator prompts are above the minimum cacheable length.
  - **Don't change `tool_choice` inside a DM loop.** The narrate-only fallback should
    keep the same tools and `auto`, and instruct the model instead of forcing the
    tool.

---

## Proposed spec changes, in priority order

| # | Change | Feature | Affects slices | Type |
|---|---|---|---|---|
| 1 | Fix the knowledge-slice Cypher (no `UNION` with different columns) | 5 | 4, 5 | Bug |
| 2 | "Unspent receipt" detection + up to 2 validated tool calls on an `unbacked_outcome` retry | 2 | 8, 11 | ADJUST |
| 3 | Engine guard: `create_fact` can't reference a `questCritical` entity | 2 | 8 | ADD |
| 4 | Fact supersession (`SUPERSEDES` edge, `retractedAtBeat` on `KNOWS`) | 5 | 1 (schema), 4 | ADD |
| 5 | Intent normalization in DM principles + a critic check for adopted player-asserted outcomes | 1 | 10, 11 | ADD |
| 6 | Critic checks claim by claim; new issue type `temporal_contradiction`; leak check covers embellishment and real-world bleed; peer self-leak → `FactLearned` | 3, 4 | 1 (schema), 11 | ADJUST |
| 7 | Caching hygiene: 1-hour TTL on the DM prefix, no `tool_choice` change mid-loop, cache metrics logged | 9 | 7, 10 | ADJUST |
| 8 | Generator near-duplicate check, motif log, `generate_story` lore check | 7 | 9 | ADD |
| 9 | Trace fingerprints (model, params, prompt hash, slice hash); idempotent `MERGE` projection | 6 | 4, 5, 7 | ADD |
| 10 | DC discipline (state DC and reason before rolling; DC spread in eval reports) | 2 | 10, 19 | ADD |
| 11 | Evals: N runs per scenario with pass rates, trace metrics, adversarial scenarios, critic calibration, fact-spread metric | 3, 4, 9 | 19 | ADD |
| 12 | UI: diegetic fillers, example verbs when chips are selected, time-to-first-feedback metric | 8 | 16 | ADD |
| 13 | **NPC voice calls** that see only the NPC's knowledge slice | 4 | 3 (spec), 10, 11 | DECIDE |
| 14 | **Streaming during a beat** (peer lines only vs. engine events too) | 8 | 12, 13, 16 | DECIDE |
| 15 | **Fork from beat N** for prompt A/B testing (after Episode N) | 6 | later | DECIDE |

None of these changes slice 2 (the engine core), so it can start while the spec is
amended. Changes 3 and 4 touch the shared schemas from slice 1 and would be done as a
small follow-up commit.
