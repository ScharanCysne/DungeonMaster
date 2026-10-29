import { spriteManifestSchema } from '@dungeon/shared';
import sheetUrl from '../../../../content/assets/kenney-1-bit/colored-transparent_packed.png?url';
import manifestRaw from '../../../../content/episode-n/sprites.json?raw';
import mapRaw from '../../../../content/episode-n/tavern.tmj?raw';
import { parseMap } from './mapData';

export { sheetUrl };
export const manifest = spriteManifestSchema.parse(JSON.parse(manifestRaw));
export const tavernMap = parseMap(mapRaw);
