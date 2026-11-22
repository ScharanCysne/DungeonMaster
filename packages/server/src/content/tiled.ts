import { z } from 'zod';
import { entityIdSchema } from '@dungeon/shared';
import type { TileBounds } from '@dungeon/shared';
import type { WalkabilityGrid } from '../engine/index.js';
import { inside } from '../engine/spatial.js';

const layerFields = {
  id: z.int().positive(),
  name: z.string().min(1),
  x: z.literal(0),
  y: z.literal(0),
  offsetx: z.literal(0).optional(),
  offsety: z.literal(0).optional(),
};
const tileLayerSchema = z.object({
  ...layerFields,
  type: z.literal('tilelayer'),
  width: z.int().positive(),
  height: z.int().positive(),
  data: z.array(z.int().min(0).max(1078)),
});
const mapObjectSchema = z.object({
  id: z.int().positive(),
  name: z.string(),
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().nonnegative(),
  height: z.int().nonnegative(),
  rotation: z.literal(0),
  point: z.boolean().optional(),
  ellipse: z.literal(false).optional(),
  polygon: z.never().optional(),
  polyline: z.never().optional(),
  gid: z.never().optional(),
  properties: z
    .array(
      z.object({
        name: z.literal('id'),
        type: z.literal('string'),
        value: entityIdSchema,
      }),
    )
    .length(1),
});
const objectLayerSchema = z.object({
  ...layerFields,
  type: z.literal('objectgroup'),
  objects: z.array(mapObjectSchema),
});

export const tiledMapSchema = z
  .object({
    type: z.literal('map'),
    orientation: z.literal('orthogonal'),
    infinite: z.literal(false),
    width: z.int().positive(),
    height: z.int().positive(),
    tilewidth: z.literal(16),
    tileheight: z.literal(16),
    tilesets: z
      .array(
        z.object({
          firstgid: z.literal(1),
          name: z.literal('kenney-1-bit'),
          image: z.literal(
            '../assets/kenney-1-bit/colored-transparent_packed.png',
          ),
          imagewidth: z.literal(784),
          imageheight: z.literal(352),
          tilewidth: z.literal(16),
          tileheight: z.literal(16),
          spacing: z.literal(0),
          margin: z.literal(0),
          columns: z.literal(49),
          tilecount: z.literal(1078),
        }),
      )
      .length(1),
    layers: z.array(
      z.discriminatedUnion('type', [tileLayerSchema, objectLayerSchema]),
    ),
  })
  .superRefine((map, ctx) => {
    const problem = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    const names = [
      'floor',
      'walls',
      'furniture',
      'collision',
      'entities',
      'rooms',
    ];
    for (const name of names) {
      const layers = map.layers.filter((layer) => layer.name === name);
      const type = ['entities', 'rooms'].includes(name)
        ? 'objectgroup'
        : 'tilelayer';
      if (layers.length !== 1 || layers[0]?.type !== type)
        problem(`Expected exactly one ${type} layer named ${name}.`);
    }
    const objectIds = new Set<number>();
    const layerIds = new Set<number>();
    for (const layer of map.layers) {
      if (!names.includes(layer.name))
        problem(`Unsupported layer ${layer.name}.`);
      if (layerIds.has(layer.id)) problem(`Duplicate layer id ${layer.id}.`);
      layerIds.add(layer.id);
      if (layer.type === 'tilelayer') {
        if (
          layer.width !== map.width ||
          layer.height !== map.height ||
          layer.data.length !== map.width * map.height
        )
          problem(`${layer.name}: expected ${map.width}x${map.height} tiles.`);
      } else {
        const entityIds = new Set<string>();
        for (const object of layer.objects) {
          const property = object.properties[0];
          if (!property) continue;
          const id = property.value;
          if (objectIds.has(object.id))
            problem(`Duplicate object id ${object.id}.`);
          objectIds.add(object.id);
          if (entityIds.has(id)) problem(`${layer.name}: duplicate id ${id}.`);
          entityIds.add(id);
          if (layer.name === 'entities') {
            if (
              !/^(char|container):/.test(id) ||
              !object.point ||
              object.width !== 0 ||
              object.height !== 0 ||
              object.x % 16 !== 8 ||
              object.y % 16 !== 8
            )
              problem(
                `${id}: entities must be character/container points at tile centers.`,
              );
          } else if (
            !id.startsWith('loc:') ||
            object.point ||
            object.width === 0 ||
            object.height === 0 ||
            [object.x, object.y, object.width, object.height].some(
              (n) => n % 16 !== 0,
            )
          ) {
            problem(
              `${id}: rooms must be location rectangles aligned to tiles.`,
            );
          }
        }
      }
    }
  });
export type TiledMap = z.infer<typeof tiledMapSchema>;
export type MapObject = z.infer<typeof mapObjectSchema>;

export function objectId(object: MapObject): string {
  const property = object.properties[0];
  if (!property)
    throw new Error(`Map object ${object.id}: missing id property.`);
  return property.value;
}

export function objectsIn(
  map: TiledMap,
  name: 'entities' | 'rooms',
): MapObject[] {
  return (
    map.layers
      .filter((layer) => layer.type === 'objectgroup')
      .find((layer) => layer.name === name)?.objects ?? []
  );
}

export function roomBounds(object: MapObject): TileBounds {
  return {
    x: object.x / 16,
    y: object.y / 16,
    w: object.width / 16,
    h: object.height / 16,
  };
}

export function walkabilityGrid(map: TiledMap): WalkabilityGrid {
  const collision = map.layers
    .filter((layer) => layer.type === 'tilelayer')
    .find((layer) => layer.name === 'collision');
  if (!collision) throw new Error('Map is missing the collision layer.');
  const rooms = objectsIn(map, 'rooms').map(roomBounds);
  return {
    width: map.width,
    height: map.height,
    walkable: Array.from({ length: map.height }, (_, y) =>
      Array.from(
        { length: map.width },
        (_, x) =>
          collision.data[y * map.width + x] === 0 &&
          rooms.some((bounds) => inside({ x, y }, bounds)),
      ),
    ),
  };
}
