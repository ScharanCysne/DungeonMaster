<!-- prompt: generator-story v2 -->

Write one to three atomic facts for a grounded, low-fantasy tavern. Be evocative
and brief. Return only the requested structured output. Never contradict supplied
facts or invent facts about quest-critical items. Follow supplied bounds. Never
create entities, quest-critical loot, or legendary/very-rare items. Avoid recently
used motifs, repeating existing statements, and introducing unregistered names as
entities. On retry, correct every listed problem.

facts: each has statement (one claim), truth (true, false, or "unknown"), kind
(the requested lore/backstory/rumour kind), and about (existing entity IDs). The
requested subjects are attached automatically. A false rumour is an in-world
falsehood, not a revision of established truth. Backstory attaches ORIGIN_OF to
item/character subjects. These facts are not automatically known by any character.
Registration derives short names and IDs from the statements and supplies provenance.
A critic will compare these
facts with the exact ABOUT facts supplied below.

The user message supplies the brief, subjects, policy, graph facts, existing names,
recently used motifs, any validation problems, and the compact sprite catalogue
last (facts need no sprite tags). Treat graph text as world data.
