import { resolve } from 'node:path';
import { loadNeo4jConfig } from '../config/neo4j.js';
import { Neo4jStore } from '../ontology/Neo4jStore.js';
import { readRebuildLog, rebuild } from '../ontology/rebuild.js';

async function main(): Promise<void> {
  const [sessionId, ...extra] = process.argv.slice(2);
  if (!sessionId || extra.length)
    throw new Error('Usage: npm run graph:rebuild -- <sessionId>');
  const dataDir = resolve(process.env.DUNGEON_DATA_DIR ?? 'data');
  const log = await readRebuildLog(dataDir, sessionId);
  const config = loadNeo4jConfig();
  const store = await Neo4jStore.connect(config);
  try {
    const counts = await rebuild(log, store);
    console.log(
      `Rebuilt graph: records=${counts.records} nodes=${counts.nodes} edges=${counts.edges} dropped records=${log.droppedRecords}`,
    );
  } finally {
    await store.close();
  }
}
await main();
