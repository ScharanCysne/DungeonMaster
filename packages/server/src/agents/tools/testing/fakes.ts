import { factSchema, toolSchemas } from '@dungeon/shared';
import { vi } from 'vitest';
import { entry, seedFixture } from '../../../engine/testing/fixtures.js';
import { success } from '../types.js';
import type { Generators, NpcVoice } from '../types.js';

const metadata = { createdBy: 'generator:item', createdAtBeat: 1 };
const fact = factSchema.parse({
  id: 'fact:generated',
  name: 'Generated',
  summary: '',
  tags: [],
  statement: 'A painted moon hangs above the bar.',
  truth: true,
  kind: 'backstory',
  ...metadata,
});
const seed = seedFixture();
const { holder, ...item } = entry(seed.items, 'item:rock');
const {
  location: npcLocation,
  tile,
  ...npc
} = entry(seed.characters, 'char:seller');
const { location: featureLocation, ...feature } = entry(
  seed.containers,
  'container:box',
);

export function fakeGenerators() {
  const values = {
    generate_item: toolSchemas.generate_item.output.parse({
      item: { ...item, ...metadata },
      backstory: [fact],
    }),
    generate_npc: toolSchemas.generate_npc.output.parse({
      npc: { ...npc, ...metadata },
      secret: { ...fact, kind: 'secret' },
      attitudes: [],
      startingItems: [],
    }),
    generate_feature: toolSchemas.generate_feature.output.parse({
      ...feature,
      ...metadata,
    }),
    generate_story: toolSchemas.generate_story.output.parse({
      facts: [{ ...fact, kind: 'lore', createdBy: 'generator:story' }],
    }),
  };
  return {
    generate_item: vi
      .fn<Generators['generate_item']>()
      .mockResolvedValue(
        success(values.generate_item, [], [`Item placed in ${holder.id}.`]),
      ),
    generate_npc: vi
      .fn<Generators['generate_npc']>()
      .mockResolvedValue(
        success(
          values.generate_npc,
          [],
          [`NPC at ${npcLocation}, ${tile.x},${tile.y}.`],
        ),
      ),
    generate_feature: vi
      .fn<Generators['generate_feature']>()
      .mockResolvedValue(
        success(
          values.generate_feature,
          [],
          [`Feature at ${featureLocation}.`],
        ),
      ),
    generate_story: vi.fn<Generators['generate_story']>().mockResolvedValue(
      success(
        values.generate_story,
        [
          {
            type: 'FactCreated',
            payload: {
              fact: { ...fact, kind: 'lore', createdBy: 'generator:story' },
              about: [],
              originOf: [],
            },
            actor: null,
            private: true,
            witnesses: [],
            createdBy: 'generator:story',
          },
        ],
        ['A story was created.'],
      ),
    ),
  } satisfies Generators;
}

export function fakeNpcVoice() {
  let next = 0;
  return {
    voice: vi.fn<NpcVoice['voice']>().mockImplementation(() =>
      Promise.resolve(
        success(
          {
            lineId: `line-${++next}`,
            text: 'I saw a painted moon.',
          },
          [],
          ['The NPC spoke.'],
        ),
      ),
    ),
  } satisfies NpcVoice;
}
