import { mkdirSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { configSchema } from '@dungeon/shared';
import { AnthropicProvider } from '../agents/llm/AnthropicProvider.js';
import { readRebuildLog } from '../ontology/rebuild.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { Neo4jStore } from '../ontology/Neo4jStore.js';
import { loadNeo4jConfig } from '../config/neo4j.js';
import { createServer } from './index.js';

const replayAt = process.argv.indexOf('--replay');
const replayId = replayAt < 0 ? undefined : process.argv[replayAt + 1];
if (replayAt >= 0 && (!replayId || replayId.startsWith('--')))
  throw new Error('Usage: npm run replay -- <sessionId> [--neo4j]');
const dev = process.env.DUNGEON_DEV === '1';
const config = configSchema.parse({
  budget: {
    ...(process.env.SESSION_BUDGET_USD === undefined
      ? {}
      : { sessionUsd: Number(process.env.SESSION_BUDGET_USD) }),
    ...(process.env.SESSION_BUDGET_STEP_USD === undefined
      ? {}
      : { stepUsd: Number(process.env.SESSION_BUDGET_STEP_USD) }),
  },
});
const port = Number(process.env.PORT ?? 8787);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
  throw new Error('PORT must be an integer from 0 to 65535.');
const dataDir = resolve(process.env.DUNGEON_DATA_DIR ?? 'data');
if (replayId) await readRebuildLog(dataDir, replayId);
const provider = replayId
  ? {
      complete() {
        throw new Error('Replay must never call an LLM provider.');
      },
    }
  : new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      config,
    });
const store = process.argv.includes('--neo4j')
  ? await Neo4jStore.connect(loadNeo4jConfig())
  : new MemoryStore();
let file: ReturnType<typeof createWriteStream> | undefined;
const logStream = new Writable({
  write(chunk: Buffer, _encoding, done) {
    process.stdout.write(chunk);
    if (file) file.write(chunk, done);
    else done();
  },
});
const app = await createServer({
  provider,
  store,
  config,
  dev,
  dataDir,
  logStream,
  ...(replayId ? { replayId } : {}),
  async onSessionStarted(session) {
    if (file) await new Promise<void>((resolve) => file?.end(resolve));
    const directory = join(dataDir, 'sessions', session.id);
    mkdirSync(directory, { recursive: true });
    file = createWriteStream(join(directory, 'server.log'), {
      flags: 'a',
      mode: 0o600,
    });
  },
});
app.addHook('onClose', async () => {
  if (store instanceof Neo4jStore) await store.close();
  await new Promise<void>((resolve) => logStream.end(resolve));
  if (file) await new Promise<void>((resolve) => file?.end(resolve));
});
try {
  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
} catch (error) {
  await app.close();
  throw error;
}
const stop = () => {
  void app.close();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
