import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultConfig } from '@dungeon/shared';
import { loadNeo4jConfig } from '../config/neo4j.js';
import { Neo4jStore } from './Neo4jStore.js';

const mock = vi.hoisted(() => {
  const run =
    vi.fn<
      (
        query: string,
        params?: unknown,
      ) => Promise<{ records: { get: (key: string) => unknown }[] }>
    >();
  type Work = (tx: { run: typeof run }) => Promise<unknown>;
  type Execute = (work: Work, config: unknown) => Promise<unknown>;
  const executeRead = vi.fn<Execute>((work) => work({ run }));
  const executeWrite = vi.fn<Execute>((work) => work({ run }));
  const sessionClose = vi.fn<() => Promise<void>>();
  const session = vi.fn(() => ({
    executeRead,
    executeWrite,
    close: sessionClose,
  }));
  const verifyConnectivity = vi.fn<() => Promise<void>>();
  const close = vi.fn<() => Promise<void>>();
  const connection = { session, verifyConnectivity, close };
  const driver = vi.fn<
    (uri: string, auth: unknown, options: unknown) => typeof connection
  >(() => connection);
  return {
    run,
    executeRead,
    executeWrite,
    sessionClose,
    session,
    verifyConnectivity,
    close,
    driver,
  };
});
vi.mock('neo4j-driver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('neo4j-driver')>()),
  driver: mock.driver,
}));
const config = loadNeo4jConfig({
  NEO4J_URI: 'bolt://localhost:7687',
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: 'test-only-credential',
});
let store: Neo4jStore;
beforeEach(async () => {
  vi.clearAllMocks();
  mock.run.mockResolvedValue({ records: [] });
  mock.sessionClose.mockResolvedValue();
  mock.verifyConnectivity.mockResolvedValue();
  mock.close.mockResolvedValue();
  store = await Neo4jStore.connect(config);
  vi.clearAllMocks();
});
afterEach(async () => {
  await store.close();
});

it('uses one write transaction for a batch and closes the session', async () => {
  await store.apply([
    { type: 'removeNode', id: 'char:a' },
    { type: 'removeNode', id: 'char:b' },
  ]);
  expect(mock.executeWrite).toHaveBeenCalledTimes(1);
  expect(mock.run).toHaveBeenCalledTimes(2);
  expect(mock.executeWrite).toHaveBeenCalledWith(expect.any(Function), {
    timeout: defaultConfig.timeouts.neo4jTransactionMs,
  });
  expect(mock.sessionClose).toHaveBeenCalledTimes(1);
});
it('uses query timeouts for individual reads and one transaction timeout for a reader callback', async () => {
  await store.getNode('char:a');
  await store.nodes();
  await store.edges();
  expect(mock.executeRead).toHaveBeenCalledTimes(3);
  for (const [, options] of mock.executeRead.mock.calls)
    expect(options).toEqual({ timeout: defaultConfig.timeouts.neo4jQueryMs });
  vi.clearAllMocks();
  await store.read(async (reader) => {
    await reader.nodes();
    await reader.edges();
    await reader.getNode('char:a');
  });
  expect(mock.executeRead).toHaveBeenCalledTimes(1);
  expect(mock.run).toHaveBeenCalledTimes(3);
  expect(mock.executeRead).toHaveBeenCalledWith(expect.any(Function), {
    timeout: defaultConfig.timeouts.neo4jTransactionMs,
  });
  expect(mock.sessionClose).toHaveBeenCalledTimes(1);
});
it('closes failed sessions and rethrows unknown callback errors unchanged', async () => {
  const failure = new Error('Caller failure');
  await expect(store.read(() => Promise.reject(failure))).rejects.toBe(failure);
  expect(mock.sessionClose).toHaveBeenCalledTimes(1);
});
it('detects zero-match mutations and closes failed write sessions', async () => {
  mock.run.mockResolvedValue({ records: [{ get: () => 0 }] });
  await expect(
    store.apply([
      { type: 'setNodeProps', id: 'char:missing', props: { hp: 1 } },
    ]),
  ).rejects.toMatchObject({
    kind: 'missing_node',
    message: 'Cannot update missing node char:missing.',
  });
  await expect(
    store.apply([
      {
        type: 'upsertEdge',
        edge: {
          type: 'CARRIES',
          from: 'char:player',
          to: 'item:missing',
          properties: {},
          createdBy: 'engine',
          createdAtBeat: 1,
        },
      },
    ]),
  ).rejects.toMatchObject({ kind: 'missing_endpoint' });
  expect(mock.sessionClose).toHaveBeenCalledTimes(2);
});
it('closes the driver when connectivity fails', async () => {
  const failure = new Error('Unknown connectivity failure');
  mock.verifyConnectivity.mockRejectedValueOnce(failure);
  await expect(Neo4jStore.connect(config)).rejects.toBe(failure);
  expect(mock.close).toHaveBeenCalledTimes(1);
});
