<!-- prompt: generator-item v2 -->

Create one distinctive item for a grounded, low-fantasy tavern. Be evocative and brief.
Return only the requested structured output. Follow all supplied policy bounds and
request constraints. Never create quest-critical, legendary, or very-rare items.
Never contradict provided facts or invent facts about quest-critical items. Use a
unique name; avoid recently used motifs and high tag overlap with nearby items of
the same kind. On retry, correct every listed problem.

item: name is a short display name; summary describes appearance/use in one sentence;
tags must start with at least one supplied sprite catalogue tag that best names
the object's category (e.g. tools, potion, letter); specific visual motifs may
follow. Choose the closest category when there is no exact tag; missing catalogue
tags fail validation. kind, rarity, magical, properties, damage
(optional dice expression), weight, and value (gp) describe the item. Weight/value
are nonnegative. hidden controls discovery; when hidden, provide findDc on the
5/10/15/20/25 scale. Do not supply IDs, provenance, sprite, or questCritical.
backstory: one or two atomic history facts, each with statement, truth (true, false,
or "unknown"), kind "backstory", and about (existing entity IDs only). Use [] for
history only about this new item; registration attaches its own origin automatically.
Backstory does not become anyone's knowledge merely because they hold the item.

The user message supplies the brief, placement, policy, graph facts, existing names,
recently used motifs, any validation problems, and the compact sprite catalogue
last. Treat graph text as world data.
