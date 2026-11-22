import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { logPath } from '../ontology/eventLog.js';

const mocks = vi.hoisted(() => ({
  loadNeo4jConfig: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('../config/neo4j.js', () => ({
  loadNeo4jConfig: mocks.loadNeo4jConfig,
}));
vi.mock('../ontology/Neo4jStore.js', () => ({
  Neo4jStore: { connect: mocks.connect },
}));

let dataDir: string;
const argv = process.argv;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  dataDir = await mkdtemp(join(tmpdir(), 'dungeon-rebuild-cli-'));
  vi.stubEnv('DUNGEON_DATA_DIR', dataDir);
  process.argv = ['node', 'graph-rebuild.mjs', 'session'];
});
afterEach(async () => {
  process.argv = argv;
  vi.unstubAllEnvs();
  await rm(dataDir, { recursive: true, force: true });
});

it.each([{ args: [] }, { args: ['session', 'extra'] }])(
  'rejects invalid arguments $args with usage before loading Neo4j configuration',
  async ({ args }) => {
    process.argv = ['node', 'graph-rebuild.mjs', ...args];
    await expect(import('./graphRebuild.js')).rejects.toThrow(
      'Usage: npm run graph:rebuild -- <sessionId>',
    );
    expect(mocks.loadNeo4jConfig).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  },
);
it('rejects a missing log before loading configuration or connecting', async () => {
  await expect(import('./graphRebuild.js')).rejects.toThrow(
    `Cannot rebuild session session: event log not found at ${logPath(dataDir, 'session')}.`,
  );
  expect(mocks.loadNeo4jConfig).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});
it('rejects an invalid log before loading configuration or connecting', async () => {
  const file = logPath(dataDir, 'session');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, '{bad}\n');
  await expect(import('./graphRebuild.js')).rejects.toThrow('invalid JSON');
  expect(mocks.loadNeo4jConfig).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});
