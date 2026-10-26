import { int } from 'neo4j-driver';
import type { Integer } from 'neo4j-driver';
import { z } from 'zod';
import {
  characterSchema,
  edgeSchema,
  nodeSchema,
  tileSchema,
} from '@dungeon/shared';
import type { Edge } from '@dungeon/shared';
import type { GraphNode } from './mutations.js';

export const nodePrefixSchema = z.enum([
  'char',
  'item',
  'loc',
  'container',
  'faction',
  'quest',
  'fact',
  'event',
]);
export type NodePrefix = z.infer<typeof nodePrefixSchema>;
const jsonFields = new Set(['abilities', 'tileBounds', 'tile', 'roll']);
const propertiesSchema = z.record(z.string(), z.unknown());
const characterWithTileSchema = characterSchema.extend({
  tile: tileSchema.optional(),
});
type Property = string | boolean | number | Integer | string[];

export function encodeProperties(values: object): Record<string, Property> {
  const encoded: Record<string, Property> = {};
  for (const [key, value] of Object.entries(propertiesSchema.parse(values))) {
    if (value === undefined) continue;
    if (jsonFields.has(key)) encoded[key] = JSON.stringify(value);
    else if (typeof value === 'number')
      encoded[key] = Number.isInteger(value) ? int(value) : value;
    else if (typeof value === 'string' || typeof value === 'boolean')
      encoded[key] = value;
    else encoded[key] = z.array(z.string()).parse(value);
  }
  return encoded;
}
function decodeProperties(value: unknown): Record<string, unknown> {
  const props = propertiesSchema.parse(value);
  for (const key of jsonFields) {
    if (props[key] !== undefined)
      props[key] = JSON.parse(z.string().parse(props[key]));
  }
  return props;
}
export function decodeNode(value: unknown): GraphNode {
  const props = decodeProperties(value);
  if (typeof props.id === 'string' && props.id.startsWith('char:')) {
    const { tile, ...character } = characterWithTileSchema.parse(props);
    return tile === undefined ? character : { ...character, tile };
  }
  return nodeSchema.parse(props);
}
export function decodeEdge(value: unknown): Edge {
  const row = z
    .object({
      type: z.string(),
      from: z.string(),
      to: z.string(),
      props: propertiesSchema,
    })
    .parse(value);
  const { createdBy, createdAtBeat, ...properties } = row.props;
  return edgeSchema.parse({
    type: row.type,
    from: row.from,
    to: row.to,
    createdBy,
    createdAtBeat,
    properties,
  });
}
