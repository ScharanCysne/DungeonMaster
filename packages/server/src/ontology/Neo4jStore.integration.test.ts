import { randomUUID } from 'node:crypto';
import { driver } from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadNeo4jConfig } from '../config/neo4j.js';
import { Neo4jStore } from './Neo4jStore.js';
import { MemoryStore } from './MemoryStore.js';
import {
  Neo4jAuthError,
  Neo4jConstraintViolationError,
} from './neo4jErrors.js';
import { project } from './projector.js';
import { graphSnapshot, record, seedRecord } from './testing/fixtures.js';
import { replayRecords } from './testing/replayRecords.js';
import { runStoreContract } from './testing/storeContract.js';

const config = loadNeo4jConfig();
describe('Neo4jStore integration', () => {
  let store: Neo4jStore;
  let raw: Driver | undefined;
  beforeAll(async () => {
    store = await Neo4jStore.connect(config);
    raw = driver(config.uri, config.authToken(), {
      disableLosslessIntegers: true,
    });
  });
  beforeEach(async () => {
    await store.clear();
  });
  afterAll(async () => {
    await store?.close();
    await raw?.close();
  });
  async function rawQuery(query: string) {
    if (!raw) throw new Error('Integration driver has not connected');
    const session = raw.session();
    try {
      return await session.run<Record<string, unknown>>(query);
    } finally {
      await session.close();
    }
  }
  runStoreContract('Neo4jStore', () => store);

  it('replays the Slice 4 scenario identically to MemoryStore, including repeated projection', async () => {
    const memory = new MemoryStore();
    for (const record of replayRecords()) {
      const mutations = project(record);
      await memory.apply(mutations);
      await store.apply(mutations);
      await store.apply(mutations);
    }
    expect(await graphSnapshot(store)).toEqual(await graphSnapshot(memory));
  });
  it('round-trips tiles, abilities, tile bounds, roll, string arrays, integers and fractions', async () => {
    const seed = seedRecord();
    await store.apply(project(seed));
    const memory = new MemoryStore();
    await memory.apply(project(seed));
    const attack = record('AttackResolved', {
      attacker: 'char:player',
      target: 'char:peer',
      weaponId: 'item:rock',
      roll: { expr: '1d20+3', rolls: [14], total: 17, outcome: 'success' },
      hit: true,
      critical: false,
    });
    for (const target of [store, memory]) {
      await target.apply(project(attack));
      await target.apply([
        {
          type: 'setNodeProps',
          id: 'char:player',
          props: { tile: { x: 2, y: 3 } },
        },
      ]);
      const item = await target.getNode('item:rock');
      if (!item || !('weight' in item)) throw new Error('Missing item fixture');
      await target.apply([
        {
          type: 'upsertNode',
          node: { ...item, weight: 0.125, properties: ['heavy', 'test'] },
        },
      ]);
    }
    expect(await graphSnapshot(store)).toEqual(await graphSnapshot(memory));
    const result = await rawQuery(
      "MATCH (c:Character {id: 'char:player'}), (i:Item {id: 'item:rock'}) RETURN valueType(c.hp) AS integerType, valueType(i.weight) AS floatType, c.abilities AS abilities, c.tile AS tile, i.properties AS properties",
    );
    const row = result.records[0];
    expect(row?.get('integerType')).toBe('INTEGER NOT NULL');
    expect(row?.get('floatType')).toBe('FLOAT NOT NULL');
    expect(typeof row?.get('abilities')).toBe('string');
    expect(typeof row?.get('tile')).toBe('string');
    expect(row?.get('properties')).toEqual(['heavy', 'test']);
  });
  it('installs the nine unique id constraints and event beat index idempotently', async () => {
    const second = await Neo4jStore.connect(config);
    await second.close();
    const constraints = await rawQuery(
      'SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties RETURN name, type, labelsOrTypes, properties',
    );
    const expected = [
      ['character', 'Character'],
      ['item', 'Item'],
      ['location', 'Location'],
      ['container', 'Container'],
      ['faction', 'Faction'],
      ['quest', 'Quest'],
      ['fact', 'Fact'],
      ['event', 'Event'],
      ['entity', 'Entity'],
    ];
    for (const [name, label] of expected) {
      const constraint = constraints.records.find(
        (row) => row.get('name') === `${name}_id`,
      );
      expect(constraint?.get('type')).toBe('UNIQUENESS');
      expect(constraint?.get('labelsOrTypes')).toEqual([label]);
      expect(constraint?.get('properties')).toEqual(['id']);
    }
    const indexes = await rawQuery(
      'SHOW INDEXES YIELD name, labelsOrTypes, properties RETURN name, labelsOrTypes, properties',
    );
    const index = indexes.records.find(
      (row) => row.get('name') === 'event_beat',
    );
    expect(index?.get('labelsOrTypes')).toEqual(['Event']);
    expect(index?.get('properties')).toEqual(['beat']);
  });
  it('wraps constraint violations and rolls back the entire mutation batch', async () => {
    await store.apply(project(seedRecord()));
    const before = await graphSnapshot(store);
    const character = await store.getNode('char:player');
    if (!character || !('role' in character))
      throw new Error('Missing character fixture');
    await rawQuery("CREATE (:Character {id: 'char:x'})");
    await expect(
      store.apply([
        { type: 'setNodeProps', id: 'char:player', props: { hp: 1 } },
        { type: 'upsertNode', node: { ...character, id: 'char:x' } },
      ]),
    ).rejects.toBeInstanceOf(Neo4jConstraintViolationError);
    expect(await graphSnapshot(store)).toEqual(before);
  });
  it('fails loudly on corrupt stored nodes and relationships', async () => {
    await store.apply(project(seedRecord()));
    await rawQuery(
      "MATCH (n:Character {id: 'char:player'}) SET n.abilities = '{broken'",
    );
    await expect(store.getNode('char:player')).rejects.toBeInstanceOf(
      SyntaxError,
    );
    await rawQuery(
      "MATCH (:Character {id: 'char:player'})-[r:KNOWS]->() SET r.confidence = 'bad'",
    );
    await expect(
      store.edges({ types: ['KNOWS'], from: 'char:player' }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
  it('distinguishes authentication failures without exposing either credential', async () => {
    const invalidCredential = randomUUID();
    const wrong = loadNeo4jConfig({
      ...process.env,
      NEO4J_PASSWORD: invalidCredential,
    });
    try {
      const unexpected = await Neo4jStore.connect(wrong, {
        maxTransactionRetryTimeMs: 0,
      });
      await unexpected.close();
      expect.fail('Expected authentication failure');
    } catch (error) {
      expect(error instanceof Neo4jAuthError).toBe(true);
      if (!(error instanceof Neo4jAuthError)) throw error;
      expect(error.message).toContain(config.uri);
      expect(error.message).toContain(config.user);
      expect(error.message).toContain('.env');
      expect(error.message.includes(invalidCredential)).toBe(false);
      expect(
        error.message.includes(z.string().parse(process.env.NEO4J_PASSWORD)),
      ).toBe(false);
    }
  });
});
