import {
  generatedItemSchema,
  generatedNpcSchema,
  generatedFeatureSchema,
  generatedStorySchema,
} from '@dungeon/shared';
import type { Generators } from '../tools/types.js';
import { generate } from './pipeline.js';
import type { GeneratorOptions } from './pipeline.js';
import {
  prepareItem,
  prepareNpc,
  prepareFeature,
  prepareStory,
} from './prepare.js';

export function createGenerators(options: GeneratorOptions): Generators {
  return {
    generate_item: (input, ctx) =>
      generate(
        options,
        'item',
        generatedItemSchema,
        input,
        [input.placement],
        ctx,
        (raw, registrar) => prepareItem(raw, input, registrar),
      ),
    generate_npc: (input, ctx) =>
      generate(
        options,
        'npc',
        generatedNpcSchema,
        input,
        [input.locationId],
        ctx,
        (raw, registrar) => prepareNpc(raw, input, registrar),
      ),
    generate_feature: (input, ctx) =>
      generate(
        options,
        'feature',
        generatedFeatureSchema,
        input,
        [input.locationId],
        ctx,
        (raw, registrar) => prepareFeature(raw, input, registrar),
      ),
    generate_story: (input, ctx) =>
      generate(
        options,
        'story',
        generatedStorySchema,
        input,
        input.about,
        ctx,
        (raw, registrar) => prepareStory(raw, input, registrar),
      ),
  };
}
export type { GeneratorOptions } from './pipeline.js';
