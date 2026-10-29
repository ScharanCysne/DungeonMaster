export const TILE_SIZE = 16;
export const SHEET_COLUMNS = 49;
export const SHEET_ROWS = 22;
export const DECORATIVE_LAYERS = ['floor', 'walls', 'furniture'];

export interface MapTile {
  frame: number;
  x: number;
  y: number;
  layer: string;
}
export interface TavernMap {
  width: number;
  height: number;
  tiles: MapTile[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
export function parseMap(raw: string): TavernMap {
  const map: unknown = JSON.parse(raw);
  if (
    !record(map) ||
    !positiveInteger(map.width) ||
    !positiveInteger(map.height) ||
    map.tilewidth !== TILE_SIZE ||
    map.tileheight !== TILE_SIZE ||
    map.orientation !== 'orthogonal' ||
    map.infinite !== false ||
    !Array.isArray(map.layers)
  )
    throw new Error('Expected a finite orthogonal map of 16px tiles.');
  const { width, height } = map;
  const layers: unknown[] = map.layers;
  const tiles = DECORATIVE_LAYERS.flatMap((name) => {
    const layer = layers.find((value) => record(value) && value.name === name);
    if (
      !record(layer) ||
      layer.type !== 'tilelayer' ||
      layer.width !== width ||
      layer.height !== height ||
      !Array.isArray(layer.data) ||
      layer.data.length !== width * height
    )
      throw new Error(`Invalid decorative layer: ${name}`);
    const data: unknown[] = layer.data;
    return data.flatMap((gid, index) => {
      if (
        typeof gid !== 'number' ||
        !Number.isInteger(gid) ||
        gid < 0 ||
        gid > SHEET_COLUMNS * SHEET_ROWS
      )
        throw new Error(`Invalid tile gid in ${name}`);
      return gid === 0 || layer.visible === false
        ? []
        : [
            {
              frame: gid - 1,
              x: index % width,
              y: Math.floor(index / width),
              layer: name,
            },
          ];
    });
  });
  return { width, height, tiles };
}
