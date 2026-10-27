import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { z } from 'zod';
import { episodeSeedSchema, spriteManifestSchema } from '@dungeon/shared';
import { checkConsistency, contentCounts } from './consistency.js';
import { tiledMapSchema, walkabilityGrid } from './tiled.js';

export const episodeDirectory = fileURLToPath(
  new URL('../../../../content/episode-n/', import.meta.url),
);

async function readContent<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    return schema.parse(raw);
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : 'Invalid content.'}`,
      { cause: error },
    );
  }
}

export async function loadEpisode(directory = episodeDirectory) {
  const [seed, map, sprites] = await Promise.all([
    readContent(join(directory, 'seed.json'), episodeSeedSchema),
    readContent(join(directory, 'tavern.tmj'), tiledMapSchema),
    readContent(join(directory, 'sprites.json'), spriteManifestSchema),
  ]);
  return {
    seed,
    map,
    sprites,
    grid: walkabilityGrid(map),
    counts: contentCounts(seed),
    problems: checkConsistency(seed, map, sprites),
  };
}

export { checkConsistency, contentCounts } from './consistency.js';
export { tiledMapSchema, walkabilityGrid } from './tiled.js';
