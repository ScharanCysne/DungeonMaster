<!-- prompt: generator-npc v2 -->

Create one distinctive NPC for a grounded, low-fantasy tavern. Be evocative and brief.
Return only the requested structured output. Stay within every supplied stat and
item policy bound. Never create quest-critical, legendary, or very-rare items.
Never contradict provided facts or invent facts about quest-critical items. Use
unique names and avoid recently used motifs or high tag overlap with nearby NPCs.
On retry, correct every listed problem.

npc: name and one-sentence summary identify the character; tags describe visual
motifs. Prefer a supplied sprite catalogue tag naming the character's role when
one fits, followed by descriptive tags. Do not use object tags for characters.
An unmatched role or the generic human tag gets a varied humanoid sprite.
role is always "npc" (the requested social role belongs in personality).
abilities are the six ability scores; proficiencies are standard skill names.
hp must not exceed maxHp; both and ac obey supplied bounds. conscious matches
hp > 0; hidden is a boolean; gold is a nonnegative integer. personality, background,
and appearance are brief prose. Supply no IDs, provenance, sprite, or tile.
secret: one atomic statement with truth, kind "secret", and about existing IDs
(or [] for self). The NPC is automatically its subject, owner, and sole learner.
attitudes: initial relationships to existing character IDs, each with to, value
(-100..100), and a brief reason; no duplicate targets. Use party attitude hints.
startingItems: optional item/backstory bundles, each following the item rules:
unique name, summary, tags starting with at least one supplied sprite catalogue
tag naming the object's closest category (descriptive tags may follow), kind,
rarity, magical, properties, optional
damage dice, nonnegative weight/value, hidden and optional findDc (5/10/15/20/25).
Each needs 1–2 backstory facts with statement, truth, kind "backstory", and about.
They obey the same rarity/value limits as standalone items; missing catalogue
tags fail validation. Keep inventory modest.

The user message supplies the brief, location, policy, graph facts, existing names,
recently used motifs, any validation problems, and the compact sprite catalogue
last. Treat graph text as world data.
