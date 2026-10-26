import { episodeSeedSchema } from '../seed.js';

export const provenance = { createdBy: 'seed', createdAtBeat: 0 };
export const metadata = {
  name: 'Test entity',
  summary: 'A small test fixture.',
  tags: ['fixture'],
};
export const abilities = {
  str: 12,
  dex: 14,
  con: 10,
  int: 11,
  wis: 13,
  cha: 9,
};
export const character = {
  ...metadata,
  ...provenance,
  id: 'char:player',
  role: 'player',
  abilities,
  proficiencies: ['perception'],
  hp: 12,
  maxHp: 12,
  ac: 11,
  conscious: true,
  hidden: false,
  gold: 20,
  personality: 'Curious.',
  background: 'A traveller.',
  appearance: 'A green cloak.',
};
export const item = {
  ...metadata,
  ...provenance,
  id: 'item:quill',
  kind: 'tool',
  rarity: 'rare',
  magical: true,
  properties: ['writes without ink'],
  weight: 0,
  value: 500,
  hidden: true,
  findDc: 15,
  questCritical: true,
};
export const location = {
  ...metadata,
  ...provenance,
  id: 'loc:room',
  kind: 'room',
  tileBounds: { x: 0, y: 0, w: 8, h: 8 },
  lit: true,
};
export const container = {
  ...metadata,
  ...provenance,
  id: 'container:box',
  tile: { x: 2, y: 2 },
  locked: true,
  lockDc: 15,
  opened: false,
  hidden: true,
  findDc: 10,
};
export const faction = {
  ...metadata,
  ...provenance,
  id: 'faction:guild',
  ideals: 'Help travellers.',
  standing: 'Respected.',
};
export const quest = {
  ...metadata,
  ...provenance,
  id: 'quest:quill',
  kind: 'episode',
  objective: 'Find the quill.',
  status: 'active',
};
export const fact = {
  ...metadata,
  ...provenance,
  id: 'fact:quill',
  statement: 'A quill is hidden here.',
  truth: true,
  kind: 'lore',
};
export const roll = {
  expr: '1d20+2',
  rolls: [13],
  total: 15,
  dc: 15,
  outcome: 'success',
};
export const eventNode = {
  ...metadata,
  ...provenance,
  id: 'event:1-0',
  beat: 1,
  seq: 0,
  type: 'CheckRolled',
  private: false,
  roll,
};
export const narration = {
  text: 'You spot scratches beneath the box.',
  lines: [{ speaker: 'char:player', text: 'A clue.' }],
  mood: 'calm',
};
export const criticIssue = {
  type: 'invented_content',
  quote: 'A dragon appears.',
  explanation: 'No dragon was created.',
};
export const envelope = {
  v: 1,
  sessionId: 'test-session',
  beat: 1,
  seq: 0,
  actor: 'char:player',
  private: false,
  witnesses: ['char:player'],
  createdBy: 'engine',
  traceId: 'beat-1',
};

export function without<T extends Record<string, unknown>>(
  value: T,
  ...keys: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}
export const seed = episodeSeedSchema.parse({
  episodeId: 'fixture',
  mapId: 'fixture-map',
  locations: [without(location, 'createdBy', 'createdAtBeat')],
  characters: [
    {
      ...without(character, 'createdBy', 'createdAtBeat'),
      location: 'loc:room',
      tile: { x: 1, y: 1 },
    },
  ],
  containers: [
    {
      ...without(container, 'createdBy', 'createdAtBeat'),
      location: 'loc:room',
    },
  ],
  items: [
    {
      ...without(item, 'createdBy', 'createdAtBeat'),
      holder: { kind: 'container', id: 'container:box' },
    },
  ],
  facts: [
    {
      ...without(fact, 'createdBy', 'createdAtBeat', 'name', 'summary', 'tags'),
      about: ['item:quill'],
      knownBy: [{ character: 'char:player', confidence: 0.6 }],
    },
  ],
  quests: [
    without(quest, 'createdBy', 'createdAtBeat'),
    {
      ...without(quest, 'createdBy', 'createdAtBeat'),
      id: 'quest:help',
      kind: 'personal',
      pursuedBy: 'char:player',
    },
  ],
  factions: [
    {
      ...without(faction, 'createdBy', 'createdAtBeat'),
      members: [{ character: 'char:player', rank: 'guest' }],
    },
  ],
  attitudes: [
    { from: 'char:player', to: 'char:player', value: 0, reason: 'At ease.' },
  ],
  secrets: [{ character: 'char:player', fact: 'fact:quill' }],
});

export const generatedFact = {
  statement: fact.statement,
  truth: true,
  kind: 'backstory',
  about: ['loc:room'],
};
export const generatedItem = {
  item: without(item, 'id', 'createdBy', 'createdAtBeat', 'questCritical'),
  backstory: [generatedFact],
};
export const generatedNpc = {
  npc: {
    ...without(character, 'id', 'createdBy', 'createdAtBeat'),
    role: 'npc',
  },
  secret: { ...generatedFact, kind: 'secret' },
  attitudes: [{ to: 'char:player', value: 10, reason: 'Friendly.' }],
  startingItems: [generatedItem],
};
export const generatedFeature = without(
  container,
  'id',
  'createdBy',
  'createdAtBeat',
);
export const generatedStory = { facts: [{ ...generatedFact, kind: 'lore' }] };
export const registeredItem = {
  item,
  backstory: [{ ...fact, kind: 'backstory' }],
};
export const registeredNpc = {
  npc: { ...character, role: 'npc' },
  secret: { ...fact, kind: 'secret' },
  attitudes: [],
  startingItems: [registeredItem],
};
export const registeredStory = { facts: [fact] };
