import { afterEach, expect, it, vi } from 'vitest';
import type { OntologyReader } from '../ontology/OntologyStore.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { OntologyStoreError } from '../ontology/neo4jErrors.js';
import { EventLog, readEventLog } from '../ontology/eventLog.js';
import { harness, playerIntent } from './testing/harness.js';

afterEach(() => {
  vi.restoreAllMocks();
});

it('rolls back and pauses on a failed canonical log write', async () => {
  const { session, dataDir } = await harness();
  const before = session.engine.snapshot();
  vi.spyOn(EventLog.prototype, 'commitBeat').mockRejectedValueOnce(
    new Error('Disk unavailable.'),
  );
  await session.submitIntent(playerIntent());
  expect(session.engine.snapshot()).toEqual(before);
  expect(session.state).toMatchObject({
    reason: 'internal_error',
    retryAt: null,
  });
  expect((await readEventLog(dataDir, session.id)).records).toHaveLength(2);
});

it('pauses on unavailable context reads before any provider call or mutation', async () => {
  class OfflineStore extends MemoryStore {
    offline = false;
    override read<T>(
      query: (reader: OntologyReader) => Promise<T>,
    ): Promise<T> {
      if (this.offline)
        return Promise.reject(
          new OntologyStoreError('unavailable', 'Graph offline.'),
        );
      return super.read(query);
    }
  }
  const store = new OfflineStore();
  const { session, clock } = await harness({ store });
  const before = session.engine.snapshot();
  store.offline = true;
  await session.submitIntent(playerIntent());
  expect(session.engine.snapshot()).toEqual(before);
  expect(session.state).toMatchObject({
    reason: 'graph_unavailable',
    retryAt: 5000,
  });
  store.offline = false;
  await clock.advance(5000);
  expect(session.beat).toBe(1);
});

it('allows inventory selections through the same visibility rule', async () => {
  const { session } = await harness();
  const inventory = (await session.knowledge()).inventory[0];
  if (!inventory) throw new Error('Expected seeded inventory.');
  const result = await session.submitIntent({
    ...playerIntent(),
    selection: [inventory.id],
  });
  expect(result?.result.beat).toBe(1);
});
