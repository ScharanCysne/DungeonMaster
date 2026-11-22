import { episodeSeedSchema, skillSchema } from '@dungeon/shared';
import type {
  CharacterId,
  EpisodeSeed,
  Skill,
  ToolResult,
} from '@dungeon/shared';
import { expect } from 'vitest';
import { Engine } from '../index.js';
import type { EventDraft, WalkabilityGrid } from '../index.js';

const metadata = { name: 'Fixture', summary: '', tags: [] };
const abilities = { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 };
const character = {
  ...metadata,
  role: 'npc',
  abilities,
  proficiencies: skillSchema.options,
  hp: 12,
  maxHp: 12,
  ac: 12,
  conscious: true,
  hidden: false,
  gold: 20,
  personality: '',
  background: '',
  appearance: '',
  location: 'loc:room',
};
const item = {
  ...metadata,
  kind: 'tool',
  rarity: 'common',
  magical: false,
  properties: [],
  weight: 1,
  value: 2,
  hidden: false,
  questCritical: false,
};

export function seedFixture(): EpisodeSeed {
  return episodeSeedSchema.parse({
    episodeId: 'engine-test',
    mapId: 'small-grid',
    locations: [
      {
        ...metadata,
        id: 'loc:room',
        kind: 'room',
        lit: true,
        tileBounds: { x: 0, y: 0, w: 4, h: 4 },
      },
      {
        ...metadata,
        id: 'loc:other',
        kind: 'room',
        lit: true,
        tileBounds: { x: 4, y: 0, w: 4, h: 4 },
      },
    ],
    characters: [
      {
        ...character,
        id: 'char:player',
        name: 'Player',
        role: 'player',
        tile: { x: 0, y: 1 },
      },
      {
        ...character,
        id: 'char:peer',
        name: 'Peer',
        role: 'peer',
        tile: { x: 1, y: 3 },
      },
      { ...character, id: 'char:seller', name: 'Seller', tile: { x: 3, y: 2 } },
      {
        ...character,
        id: 'char:watcher',
        name: 'Watcher',
        tile: { x: 2, y: 0 },
      },
      {
        ...character,
        id: 'char:other',
        location: 'loc:other',
        tile: { x: 6, y: 1 },
      },
    ],
    containers: [
      {
        ...metadata,
        id: 'container:box',
        location: 'loc:room',
        tile: { x: 2, y: 2 },
        locked: false,
        opened: false,
        hidden: false,
      },
      {
        ...metadata,
        id: 'container:lockbox',
        location: 'loc:room',
        tile: { x: 3, y: 0 },
        locked: true,
        lockDc: 10,
        opened: false,
        hidden: false,
      },
      {
        ...metadata,
        id: 'container:secret',
        location: 'loc:room',
        tile: { x: 3, y: 3 },
        locked: false,
        opened: false,
        hidden: true,
        findDc: 5,
      },
    ],
    items: [
      {
        ...item,
        id: 'item:quest',
        name: 'Quest token',
        hidden: true,
        findDc: 10,
        questCritical: true,
        holder: { kind: 'container', id: 'container:box' },
      },
      {
        ...item,
        id: 'item:potion',
        kind: 'consumable',
        holder: { kind: 'character', id: 'char:player' },
      },
      {
        ...item,
        id: 'item:key',
        properties: ['key_for:container:lockbox'],
        holder: { kind: 'character', id: 'char:player' },
      },
      {
        ...item,
        id: 'item:rock',
        holder: { kind: 'character', id: 'char:player' },
      },
      {
        ...item,
        id: 'item:goods',
        holder: { kind: 'character', id: 'char:seller' },
      },
      {
        ...item,
        id: 'item:floor',
        holder: { kind: 'location', id: 'loc:room' },
      },
      {
        ...item,
        id: 'item:secret',
        hidden: true,
        findDc: 5,
        holder: { kind: 'location', id: 'loc:room' },
      },
    ],
    facts: [],
    quests: [],
    factions: [],
    attitudes: [],
    secrets: [],
  });
}

export function gridFixture(): WalkabilityGrid {
  return {
    width: 8,
    height: 4,
    walkable: Array.from({ length: 4 }, () => Array<boolean>(8).fill(true)),
  };
}

export function fixture(
  edit: (seed: EpisodeSeed, grid: WalkabilityGrid) => void = () => {},
  sessionSeed = 'fixture',
): Engine {
  const seed = seedFixture();
  const grid = gridFixture();
  edit(seed, grid);
  const engine = new Engine(episodeSeedSchema.parse(seed), grid, sessionSeed);
  engine.beginBeat(1);
  return engine;
}

export function entry<T extends { id: string }>(entries: T[], id: string): T {
  const value = entries.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing fixture ${id}`);
  return value;
}

export function value<T>(result: ToolResult<T, EventDraft>): T {
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

export function receipt(
  engine: Engine,
  skill: Skill = 'stealth',
  actor: CharacterId = 'char:player',
): string {
  return value(
    engine.skill_check({
      actor,
      skill,
      dc: 5,
      advantage: 'none',
      reason: 'Fixture check',
    }),
  ).checkId;
}

export function rejects(
  engine: Engine,
  command: () => ToolResult<unknown, EventDraft>,
  code: string,
  offending = '',
): void {
  const before = engine.snapshot();
  const result = command();
  expect({
    code: result.ok ? 'UNEXPECTED_SUCCESS' : result.error.code,
    namesValue: !result.ok && result.error.message.includes(offending),
    snapshot: engine.snapshot(),
  }).toEqual({
    code,
    namesValue: true,
    snapshot: before,
  });
}
