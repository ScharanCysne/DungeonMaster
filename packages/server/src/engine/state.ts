import { validateSeedReferences } from '@dungeon/shared';
import type {
  CharacterId,
  ContainerId,
  EpisodeSeed,
  EquipmentSlot,
  ItemId,
  LocationId,
  SeedCharacter,
  SeedContainer,
  SeedItem,
  SeedLocation,
  Tile,
} from '@dungeon/shared';
import { requireRule } from './errors.js';
import type { CheckReceipt } from './receipts.js';
import { beatSeed } from './rules/dice.js';

export interface WalkabilityGrid {
  width: number;
  height: number;
  walkable: boolean[][];
  doors?: { tile: Tile; locked: boolean }[];
}

export type EngineCharacter = Omit<SeedCharacter, 'location'> & {
  locationId: LocationId;
  inventory: ItemId[];
  equipped: Partial<Record<EquipmentSlot, ItemId>>;
};
export type EngineContainer = Omit<SeedContainer, 'location'> & {
  locationId: LocationId;
  contents: ItemId[];
  keyIds: ItemId[];
};
export type EngineItem = SeedItem;

export interface EngineState {
  beat: number;
  attempt: number;
  rngSeed: string;
  rngState: number;
  characters: Map<CharacterId, EngineCharacter>;
  containers: Map<ContainerId, EngineContainer>;
  items: Map<ItemId, EngineItem>;
  locations: Map<LocationId, SeedLocation>;
  grid: WalkabilityGrid;
  receipts: Map<string, CheckReceipt>;
  receiptCounter: number;
  combat: null;
}

export function createState(
  seed: EpisodeSeed,
  grid: WalkabilityGrid,
  sessionSeed: string,
): EngineState {
  const problems = validateSeedReferences(seed);
  requireRule(problems.length === 0, 'INVALID_SEED', problems.join(' '));
  for (const character of seed.characters) {
    requireRule(
      character.hp <= character.maxHp &&
        (character.hp > 0 || !character.conscious),
      'INVALID_SEED',
      `${character.id}: HP ${character.hp}/${character.maxHp}, conscious ${character.conscious}; expected HP <= maxHp and unconscious at zero HP.`,
    );
  }
  requireRule(
    Number.isInteger(grid.width) &&
      grid.width > 0 &&
      Number.isInteger(grid.height) &&
      grid.height > 0 &&
      grid.walkable.length === grid.height &&
      grid.walkable.every((row) => row.length === grid.width),
    'INVALID_GRID',
    `${grid.width}x${grid.height}: expected a rectangular, positive walkability grid.`,
  );
  const state: EngineState = {
    beat: 0,
    attempt: 0,
    rngSeed: sessionSeed,
    rngState: beatSeed(sessionSeed, 0, 0),
    characters: new Map(
      seed.characters.map(({ location, ...character }) => [
        character.id,
        {
          ...character,
          locationId: location,
          inventory: [],
          equipped: {},
        },
      ]),
    ),
    containers: new Map(
      seed.containers.map(({ location, ...container }) => [
        container.id,
        {
          ...container,
          locationId: location,
          contents: [],
          keyIds: seed.items
            .filter((item) =>
              item.properties.includes(`key_for:${container.id}`),
            )
            .map((item) => item.id),
        },
      ]),
    ),
    items: new Map(seed.items.map((item) => [item.id, item])),
    locations: new Map(
      seed.locations.map((location) => [location.id, location]),
    ),
    grid,
    receipts: new Map(),
    receiptCounter: 0,
    combat: null,
  };
  for (const item of state.items.values()) {
    if (item.holder.kind === 'character')
      state.characters.get(item.holder.id)?.inventory.push(item.id);
    if (item.holder.kind === 'container')
      state.containers.get(item.holder.id)?.contents.push(item.id);
  }
  return structuredClone(state);
}
