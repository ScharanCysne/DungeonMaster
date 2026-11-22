import { isInt } from 'neo4j-driver';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { decodeEdge, decodeNode, encodeProperties } from './neo4jCodec.js';
import { project } from './projector.js';
import { replayRecords } from './testing/replayRecords.js';

function driverProperties(value: object) {
  return Object.fromEntries(
    Object.entries(encodeProperties(value)).map(([key, property]) => [
      key,
      isInt(property) ? property.toNumber() : property,
    ]),
  );
}
it('round-trips all projected replay nodes and relationships through the property codec', () => {
  for (const record of replayRecords()) {
    for (const mutation of project(record)) {
      if (mutation.type === 'upsertNode')
        expect(decodeNode(driverProperties(mutation.node))).toEqual(
          mutation.node,
        );
      if (mutation.type === 'upsertEdge') {
        const { type, from, to, createdBy, createdAtBeat, properties } =
          mutation.edge;
        expect(
          decodeEdge({
            type,
            from,
            to,
            props: driverProperties({
              ...properties,
              createdBy,
              createdAtBeat,
            }),
          }),
        ).toEqual(mutation.edge);
      }
    }
  }
});
it('writes integers, floats, native string arrays, JSON objects and absent optionals distinctly', () => {
  const props = encodeProperties({
    hp: 3,
    weight: 0.125,
    tags: ['test'],
    tile: { x: 1, y: 2 },
    damage: undefined,
  });
  expect(isInt(props.hp)).toBe(true);
  expect(props.weight).toBe(0.125);
  expect(props.tags).toEqual(['test']);
  expect(props.tile).toBe('{"x":1,"y":2}');
  expect(props).not.toHaveProperty('damage');
});
it('rejects invalid node, tile, edge and nested JSON data', () => {
  expect(() => decodeNode({ id: 'char:bad' })).toThrow(z.ZodError);
  expect(() => decodeNode({ id: 'char:bad', tile: '{' })).toThrow(SyntaxError);
  expect(() =>
    decodeNode({ id: 'char:bad', tile: '{"x":"bad","y":2}' }),
  ).toThrow(z.ZodError);
  expect(() =>
    decodeEdge({
      type: 'KNOWS',
      from: 'char:player',
      to: 'fact:bad',
      props: {
        createdBy: 'seed',
        createdAtBeat: 0,
        since: 0,
        source: 'seed',
        confidence: 'bad',
      },
    }),
  ).toThrow(z.ZodError);
});
