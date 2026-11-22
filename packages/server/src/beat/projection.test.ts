import { expect, it } from 'vitest';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { OntologyStoreError } from '../ontology/neo4jErrors.js';
import type { GraphMutation } from '../ontology/mutations.js';
import { verify } from '../ontology/verify.js';
import { harness, playerIntent, script, deferred } from './testing/harness.js';
import type { LlmProvider, LlmRequest } from '../agents/llm/types.js';

class FailingStore extends MemoryStore {
  fail = false;
  override apply(mutations: readonly GraphMutation[]) {
    if (this.fail)
      return Promise.reject(
        new OntologyStoreError('unavailable', 'Graph offline.'),
      );
    return super.apply(mutations);
  }
}

it('delivers a durable beat then pauses and catches the graph up without rerunning', async () => {
  const store = new FailingStore();
  const provider = script();
  const { session, clock } = await harness({ store, provider });
  store.fail = true;
  const result = await session.submitIntent(playerIntent());
  expect(result?.result.beat).toBe(1);
  expect(session.beat).toBe(1);
  expect(session.state).toMatchObject({ reason: 'graph_unavailable', beat: 2 });
  const calls = provider.requests.length;
  store.fail = false;
  await clock.advance(5000);
  expect(session.state).toEqual({ status: 'running' });
  expect(provider.requests).toHaveLength(calls);
  expect(await verify(session.engine.state, store)).toEqual([]);
  expect(
    (await store.nodes()).some(
      (node) => 'type' in node && node.type === 'NarrationCommitted',
    ),
  ).toBe(true);
});

it('rejects concurrent intent and session commands while a beat runs', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const scripted = script();
  const provider: LlmProvider = {
    async complete<T>(request: LlmRequest<T>) {
      if (request.role === 'dm') {
        entered.resolve();
        await release.promise;
      }
      return scripted.complete(request);
    },
  };
  const { session } = await harness({ provider });
  const running = session.submitIntent(playerIntent());
  await entered.promise;
  await expect(session.submitIntent(playerIntent())).rejects.toThrow(
    'BEAT_IN_PROGRESS',
  );
  await expect(
    session.command({ type: 'session_command', command: 'retry_now' }),
  ).rejects.toThrow('BEAT_IN_PROGRESS');
  release.resolve();
  await running;
});

it('waits for a timed-out projection before rebuilding it', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  class DelayedStore extends MemoryStore {
    delay = false;
    override async apply(mutations: readonly GraphMutation[]) {
      if (this.delay) {
        this.delay = false;
        entered.resolve();
        await release.promise;
      }
      await super.apply(mutations);
    }
  }
  const store = new DelayedStore();
  const { session, clock } = await harness({ store });
  store.delay = true;
  const running = session.submitIntent(playerIntent());
  await entered.promise;
  await clock.advance(120_000);
  const result = await running;
  expect(result?.result.beat).toBe(1);
  expect(session.state).toMatchObject({ reason: 'graph_unavailable' });
  const retry = clock.advance(5000);
  release.resolve();
  await retry;
  expect(session.state).toEqual({ status: 'running' });
  expect(await verify(session.engine.state, store)).toEqual([]);
});
