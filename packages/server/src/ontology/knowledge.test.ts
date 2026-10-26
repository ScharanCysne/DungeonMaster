import { describe, expect, it } from 'vitest';
import { knowledgeSliceSchema, graphSchema } from '@dungeon/shared';
import type { Fact } from '@dungeon/shared';
import {
  knowledgeSlice,
  dmContext,
  selectionContext,
} from './queries/index.js';
import { project } from './projector.js';
import { ontologySeed, record, seededStore } from './testing/fixtures.js';

const correction: Fact = {
  id: 'fact:correction',
  name: 'Correction',
  summary: 'The moon was gold.',
  tags: [],
  createdBy: 'dm',
  createdAtBeat: 4,
  statement: 'The moon was gold.',
  truth: true,
  kind: 'observation',
};

describe('knowledge and ground truth', () => {
  it('retracts only a learner’s older KNOWS, keeps provenance, and leaves the fact intact', async () => {
    const store = await seededStore();
    await store.apply(
      project(
        record(
          'FactCreated',
          {
            fact: correction,
            about: ['char:seller'],
            originOf: ['item:quest'],
            supersedes: 'fact:rumour',
          },
          { beat: 4, createdBy: 'dm' },
        ),
      ),
    );
    const learned = record(
      'FactLearned',
      {
        characterId: 'char:player',
        factId: correction.id,
        since: 4,
        source: 'told',
        confidence: 0.9,
      },
      { beat: 4, seq: 1, createdBy: 'dm' },
    );
    await store.apply(project(learned));
    await store.apply(project(learned));
    expect(
      await store.edges({ types: ['SUPERSEDES'], from: correction.id }),
    ).toMatchObject([{ to: 'fact:rumour' }]);
    expect(
      await store.edges({ types: ['ORIGIN_OF'], from: correction.id }),
    ).toMatchObject([{ to: 'item:quest' }]);
    const older = await store.edges({ types: ['KNOWS'], to: 'fact:rumour' });
    expect(older.find((edge) => edge.from === 'char:player')).toMatchObject({
      createdBy: 'seed',
      createdAtBeat: 0,
      properties: { retractedAtBeat: 4, since: 0 },
    });
    expect(
      older.find((edge) => edge.from === 'char:seller')?.properties,
    ).not.toHaveProperty('retractedAtBeat');
    expect(
      (await knowledgeSlice(store, 'char:player')).facts.find(
        ({ fact }) => fact.id === 'fact:rumour',
      )?.knowledge.properties.retractedAtBeat,
    ).toBe(4);
    expect(await store.getNode('fact:rumour')).toMatchObject({ truth: false });
    await store.apply(
      project(
        record(
          'FactLearned',
          {
            ...learned.payload,
            characterId: 'char:seller',
            factId: correction.id,
            since: 6,
            source: 'deduced',
            confidence: 1,
          },
          { beat: 6 },
        ),
      ),
    );
    expect(
      await store.edges({
        types: ['KNOWS'],
        from: 'char:seller',
        to: 'fact:rumour',
      }),
    ).toMatchObject([{ properties: { retractedAtBeat: 6 } }]);
  });
  it('includes the sheet, own inventory, attitudes, quests and known secrets', async () => {
    const store = await seededStore();
    const peer = await knowledgeSlice(store, 'char:peer');
    expect(knowledgeSliceSchema.parse(peer)).toEqual(peer);
    expect(peer.character.id).toBe('char:peer');
    expect(peer.attitudes).toMatchObject([
      { to: 'char:player', properties: { value: 10 } },
    ]);
    expect(peer.quests.map((quest) => quest.id)).toEqual(['quest:personal']);
    expect(peer.secrets.map((fact) => fact.id)).toEqual(['fact:secret']);
    expect(
      (await knowledgeSlice(store, 'char:player')).inventory.map(
        (item) => item.id,
      ),
    ).toEqual(['item:potion', 'item:key', 'item:rock']);
    expect(peer.visible.map((node) => node.id)).toContain('item:floor');
    expect(peer.visible.map((node) => node.id)).not.toContain(
      'container:secret',
    );
    expect(peer.visible.map((node) => node.id)).not.toContain('char:other');
  });
  it('orders witnessed events newest first, with beat bounds and limit', async () => {
    const store = await seededStore();
    for (const [beat, seq] of [
      [1, 0],
      [2, 0],
      [2, 1],
    ] as const)
      await store.apply(
        project(
          record(
            'IntentReceived',
            { selection: [], text: `${beat}-${seq}` },
            { beat, seq, witnesses: ['char:peer'] },
          ),
        ),
      );
    const slice = await knowledgeSlice(store, 'char:peer', {
      sinceBeat: 2,
      recent: 1,
    });
    expect(slice.events.map((event) => event.id)).toEqual(['event:2-1']);
    expect(
      (await knowledgeSlice(store, 'char:peer', { recent: 0 })).events,
    ).toEqual([]);
    await expect(
      knowledgeSlice(store, 'char:peer', { recent: -1 }),
    ).rejects.toThrow('nonnegative');
  });
  it('LEAK: every character sees only facts it KNOWS and events it WITNESSED', async () => {
    const store = await seededStore();
    await store.apply(
      project(
        record(
          'IntentReceived',
          {
            selection: ['fact:unknown'],
            text: 'The coded phrase is amber crow.',
          },
          { witnesses: ['char:player'], private: true },
        ),
      ),
    );
    await store.apply(
      project(
        record(
          'EntityRevealed',
          { entityId: 'container:secret' },
          { seq: 1, witnesses: ['char:peer'] },
        ),
      ),
    );
    // An inconsistent secret relation must not bypass the KNOWS boundary.
    await store.apply([
      {
        type: 'upsertEdge',
        edge: {
          type: 'HAS_SECRET',
          from: 'char:watcher',
          to: 'fact:unknown',
          properties: {},
          createdBy: 'seed',
          createdAtBeat: 0,
        },
      },
    ]);
    const all = await store.nodes();
    for (const character of ontologySeed().characters) {
      const slice = await knowledgeSlice(store, character.id);
      expect(knowledgeSliceSchema.safeParse(slice).success).toBe(true);
      const known = new Set(
        (await store.edges({ types: ['KNOWS'], from: character.id })).map(
          (edge) => edge.to,
        ),
      );
      const witnessed = new Set(
        (await store.edges({ types: ['WITNESSED'], from: character.id })).map(
          (edge) => edge.to,
        ),
      );
      const text = JSON.stringify(slice);
      for (const node of all) {
        if ('statement' in node && !known.has(node.id)) {
          expect(text, `${character.id} leaked ${node.id}`).not.toContain(
            node.id,
          );
          expect(text).not.toContain(node.statement);
        }
        if ('seq' in node && !witnessed.has(node.id)) {
          expect(text, `${character.id} leaked ${node.id}`).not.toContain(
            node.id,
          );
          expect(text).not.toContain(node.summary);
        }
      }
    }
  });
  it('normalizes spots to rooms and excludes hidden entities from knowledge', async () => {
    const store = await seededStore();
    await store.apply(
      project(
        record('EntityMoved', {
          entityId: 'char:player',
          from: 'loc:room',
          to: 'loc:spot',
          tile: { x: 0, y: 1 },
          path: [{ x: 0, y: 1 }],
        }),
      ),
    );
    await store.apply(
      project(record('EntityHidden', { entityId: 'char:seller' }, { seq: 1 })),
    );
    const visible = (await knowledgeSlice(store, 'char:player')).visible.map(
      (node) => node.id,
    );
    expect(visible).toContain('char:peer');
    expect(visible).not.toContain('char:seller');
    expect(visible).not.toContain('item:quest');
  });
  it('gives the DM hidden entities, other rooms in the building, ownership, all quests and selection', async () => {
    const store = await seededStore();
    const dm = await dmContext(store, 'char:player', ['item:quest']);
    expect(graphSchema.parse(dm.groundTruth)).toEqual(dm.groundTruth);
    expect(dm.groundTruth.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'container:secret',
        'item:quest',
        'char:other',
        'loc:other',
      ]),
    );
    expect(dm.groundTruth.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CONTAINS',
          from: 'container:box',
          to: 'item:quest',
        }),
      ]),
    );
    expect(dm.quests).toHaveLength(2);
    expect(dm.selection[0]?.node.id).toBe('item:quest');
  });
  it('selection returns both directions of exactly one hop, including unknown facts', async () => {
    const store = await seededStore();
    const [selection] = await selectionContext(store, [
      'item:quest',
      'item:quest',
      'item:missing',
    ]);
    expect(selection?.node.id).toBe('item:quest');
    expect(
      selection?.neighbourhood.nodes.map((node) => node.id).sort(),
    ).toEqual(['container:box', 'fact:unknown']);
    expect(selection?.neighbourhood.nodes.map((node) => node.id)).not.toContain(
      'loc:room',
    );
    expect(graphSchema.safeParse(selection?.neighbourhood).success).toBe(true);
    expect(
      (
        await selectionContext(store, ['char:peer'])
      )[0]?.neighbourhood.nodes.map((node) => node.id),
    ).toContain('fact:secret');
  });
});
