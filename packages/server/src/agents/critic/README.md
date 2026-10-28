# Critic rules

Call `reviewBeat` after `DmBeat.run`, before committing. It reads ordered pending
events and current soft state. Pre-check is pure: undiscovered hidden names map to
perspective_leak; absent/unconscious speech to state_contradiction; check outcomes
without a CheckRolled to unbacked_outcome; missing, foreign or altered NPC lineIds
to invented_content. Successful unspent receipts are hints, never rejection alone.
Visible entities, possessions and ABOUT targets of known facts count as discovered.

Every proposal receives a structured LLM check, including proposals with pre-check
issues. The output wraps the shared CriticVerdict with claim/evidence pairs and
selfLeaks. Ground truth includes tool-input IDs, name matches and their edges and
facts. It also includes ordered events, intents, player/speaker knowledge and
generated story facts with basedOn evidence. Retain both checks and verdicts for
the trace. Invalid/refused checks cannot accept a proposal; absent a deterministic
rejection they fall straight back. Unavailability propagates for rollback.

One rejection calls the DM's existing retry policy. A second rejection, failed
critic, noNarration or refusal produces a neutral summary and fallback=true.
Summary templates use only player-witnessed events, in stream order, with second
person wording, no names, dialogue, mechanical totals, secret statements or free
text from event payloads. Stop at a whole sentence before 120 words. Events with no
safe visible wording are omitted; the empty summary is “You notice no further
change.” No commit occurs here.

The LLM identifies a secret disclosure by exact quote, speaker and factId. Validate
that the quote belongs to a resolved peer line and the speaker both HAS_SECRET and
actively KNOWS that fact. Only accepted final lines create FactLearned drafts,
source told, for witnesses who do not already know. Use engine perception rules;
say is public even for a private action. Append through BeatContext, never directly
to the store. Rejected proposals cannot teach facts. Flags record the disclosure
and all witnesses. Semantic detection remains the LLM's responsibility.
An exact validated disclosure can excuse a knowledge-leak issue on that quote and
the pre-check's hidden-name issue for its ABOUT subjects. It cannot excuse hidden
names elsewhere in the line or narrator prose, absent speakers or other issues.
